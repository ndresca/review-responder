import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

const OWNER_ID = '00000000-0000-0000-0000-000000000099'
const OTHER_OWNER_ID = '00000000-0000-0000-0000-000000000088'
const LOC_ID = '00000000-0000-0000-0000-000000000001'
const EXAMPLE_ID = '00000000-0000-0000-0000-000000000010'
const SESSION_ID = '00000000-0000-0000-0000-000000000020'

// Tests for the regenerate endpoint — the calibration step 3 panel's
// per-card refresh path. Auth, ownership, rate-limit, and the
// regenerateExample helper invocation all live in route.ts; the helper
// itself is tested upstream via the calibrate POST/PATCH paths. Here we
// stub regenerateExample to a fake fixture to keep the unit boundary
// at the route handler.

function mockQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, Mock> = {}
  const makeProxy = (): any => new Proxy(function () {}, {
    get: (_, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
      return chain[prop as string]
    },
  })
  for (const method of ['from', 'select', 'eq', 'gte', 'update', 'upsert', 'insert']) {
    chain[method] = vi.fn().mockReturnValue(makeProxy())
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return makeProxy()
}

function buildFrom(tableResults: Record<string, { data: unknown; error: unknown }>) {
  return vi.fn().mockImplementation((table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    return mockQuery(result)
  })
}

const NEW_EXAMPLE_FIXTURE = {
  id: 'new-example-id',
  scenario_type: '5star',
  review_sample: 'fake review sample',
  ai_response: 'fake ai response',
  decision: 'pending',
}

type SetupOpts = {
  // The user the auth helper resolves to. null = unauthenticated.
  authUserId?: string | null
  // Per-table mocks for the supabase service client.
  tables?: Record<string, { data: unknown; error: unknown }>
  // If set, the regenerate helper throws this error.
  regenerateThrows?: Error
}

async function setup(opts: SetupOpts = {}) {
  vi.resetModules()

  const fromFn = buildFrom(opts.tables ?? {
    calibration_examples: {
      data: { id: EXAMPLE_ID, session_id: SESSION_ID, location_id: LOC_ID, scenario_type: '5star' },
      error: null,
    },
    locations: {
      data: { owner_id: OWNER_ID, google_location_id: 'gloc-123' },
      error: null,
    },
  })

  const regenerateExampleMock = opts.regenerateThrows
    ? vi.fn().mockRejectedValue(opts.regenerateThrows)
    : vi.fn().mockResolvedValue(NEW_EXAMPLE_FIXTURE)

  const authUserId = opts.authUserId === undefined ? OWNER_ID : opts.authUserId

  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ from: fromFn })),
  }))
  vi.doMock('@supabase/ssr', () => ({
    createServerClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: authUserId ? { id: authUserId } : null },
        }),
      },
    })),
  }))
  vi.doMock('next/headers', () => ({
    cookies: vi.fn(async () => ({ getAll: vi.fn(() => []) })),
  }))
  vi.doMock('@/services/calibration', () => ({
    regenerateExample: regenerateExampleMock,
  }))

  process.env.SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

  const { POST } = await import('./route')
  return { POST, fromFn, regenerateExampleMock }
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/calibrate/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetModules()
})

describe('POST /api/onboarding/calibrate/regenerate', () => {
  // 1
  it('returns 200 with the new example on the success path', async () => {
    const { POST, regenerateExampleMock } = await setup()
    const res = await POST(makeReq({ exampleId: EXAMPLE_ID }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.example).toEqual(NEW_EXAMPLE_FIXTURE)
    expect(regenerateExampleMock).toHaveBeenCalledTimes(1)
    // The helper is invoked with the locationId, googleLocationId,
    // sessionId, and scenario from the example row — not the brand
    // voice (which the helper loads itself).
    expect(regenerateExampleMock.mock.calls[0][1]).toBe(LOC_ID)
    expect(regenerateExampleMock.mock.calls[0][2]).toBe('gloc-123')
    expect(regenerateExampleMock.mock.calls[0][3]).toBe(SESSION_ID)
    expect(regenerateExampleMock.mock.calls[0][4]).toBe('5star')
    // ownerFeedback is undefined — this is a brand-voice-update regen.
    expect(regenerateExampleMock.mock.calls[0][5]).toBeUndefined()
  })

  // 2
  it('returns 401 when the request is unauthenticated', async () => {
    const { POST, regenerateExampleMock } = await setup({ authUserId: null })
    const res = await POST(makeReq({ exampleId: EXAMPLE_ID }))
    expect(res.status).toBe(401)
    expect(regenerateExampleMock).not.toHaveBeenCalled()
  })

  // 3
  it('returns 400 when the body is missing exampleId', async () => {
    const { POST } = await setup()
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/exampleId is required/i)
  })

  // 4
  it('returns 400 when the body is malformed JSON', async () => {
    const { POST } = await setup()
    const req = new Request('http://localhost/api/onboarding/calibrate/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/invalid json/i)
  })

  // 5
  it('returns 404 when the example does not exist', async () => {
    const { POST, regenerateExampleMock } = await setup({
      tables: {
        calibration_examples: { data: null, error: { message: 'not found' } },
      },
    })
    const res = await POST(makeReq({ exampleId: EXAMPLE_ID }))
    expect(res.status).toBe(404)
    expect(regenerateExampleMock).not.toHaveBeenCalled()
  })

  // 6
  it('returns 404 when the calling user does not own the example (cross-tenant guard)', async () => {
    const { POST, regenerateExampleMock } = await setup({
      tables: {
        calibration_examples: {
          data: { id: EXAMPLE_ID, session_id: SESSION_ID, location_id: LOC_ID, scenario_type: '5star' },
          error: null,
        },
        // location is owned by a DIFFERENT user.
        locations: {
          data: { owner_id: OTHER_OWNER_ID, google_location_id: 'gloc-other' },
          error: null,
        },
      },
    })
    const res = await POST(makeReq({ exampleId: EXAMPLE_ID }))
    // Returns 404 (not 403) so we don't leak existence of example ids
    // belonging to other accounts.
    expect(res.status).toBe(404)
    expect(regenerateExampleMock).not.toHaveBeenCalled()
  })

  // 7
  it('returns 502 when the regenerateExample helper throws', async () => {
    const { POST } = await setup({
      regenerateThrows: new Error('OpenAI down'),
    })
    const res = await POST(makeReq({ exampleId: EXAMPLE_ID }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/failed to regenerate/i)
  })

  // 8
  it('returns 429 when the rate limit is exceeded (>= 10 regenerations in the last hour)', async () => {
    // The route calls .from('calibration_examples') TWICE: first to
    // look up the example (single() row read), then to count
    // regenerations in the last hour. We need different results for
    // each call. The default mockQuery harness returns one fixed
    // payload per table, so this test wires a per-call dispatcher.
    vi.resetModules()

    let calibCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'locations') {
        return mockQuery({
          data: { owner_id: OWNER_ID, google_location_id: 'gloc-123' },
          error: null,
        })
      }
      if (table === 'calibration_examples') {
        calibCallCount++
        if (calibCallCount === 1) {
          // First call — ownership lookup, returns the example row.
          return mockQuery({
            data: { id: EXAMPLE_ID, session_id: SESSION_ID, location_id: LOC_ID, scenario_type: '5star' },
            error: null,
          })
        }
        // Second call — rate-limit count query. The supabase JS client
        // surfaces { count, error } on the resolved result of a
        // .select('id', { count: 'exact', head: true }) chain. Mock at
        // 10 (the limit) so the gate trips.
        return mockQuery({ data: null, count: 10, error: null } as { data: unknown; error: unknown })
      }
      return mockQuery({ data: null, error: null })
    })

    const regenerateExampleMock = vi.fn().mockResolvedValue(NEW_EXAMPLE_FIXTURE)

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ from: fromFn })),
    }))
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: vi.fn(() => ({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: OWNER_ID } } }),
        },
      })),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(async () => ({ getAll: vi.fn(() => []) })),
    }))
    vi.doMock('@/services/calibration', () => ({
      regenerateExample: regenerateExampleMock,
    }))

    process.env.SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    const { POST } = await import('./route')
    const res = await POST(makeReq({ exampleId: EXAMPLE_ID }))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.error).toMatch(/too many regenerations/i)
    expect(regenerateExampleMock).not.toHaveBeenCalled()
  })
})
