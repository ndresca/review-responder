import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ─── Test fixtures ──────────────────────────────────────────────────────────

const OWNER_ID = '00000000-0000-0000-0000-000000000099'
const LOC_ID = '00000000-0000-0000-0000-000000000001'

// PR D server-side validation tests. Covers the validateChannels gate
// inside POST /api/settings/save: empty array (allowed), valid 3-channel
// payload, max-channels cap (>5 rejected), missing field, length cap,
// non-array shape.

// ─── Supabase mock ──────────────────────────────────────────────────────────

// The save route does:
//   1. SELECT owner_id from locations (single)
//   2. UPDATE brand_voices set ...
//   3. UPDATE locations set name (only if restaurantName present)
//   4. UPSERT notification_preferences (only if frequency / digestTime / timezone present)
// validateChannels runs before any DB call. To test validation alone we
// only need the location-ownership check to pass (return data with
// owner_id === OWNER_ID) and brand_voices update to succeed.
function mockQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, Mock> = {}
  const makeProxy = (): any => new Proxy(function () {}, {
    get: (_, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
      return chain[prop as string]
    },
  })
  for (const method of ['from', 'select', 'eq', 'update', 'upsert', 'insert']) {
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

const DEFAULT_TABLES = {
  locations: { data: { owner_id: OWNER_ID }, error: null },
  brand_voices: { data: null, error: null },
  notification_preferences: { data: null, error: null },
}

async function setup() {
  vi.resetModules()

  const fromFn = buildFrom(DEFAULT_TABLES)

  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ from: fromFn })),
  }))
  vi.doMock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
  }))
  vi.doMock('@/lib/session', () => ({
    getValidSession: vi.fn(async () => ({ ownerId: OWNER_ID, jwt: 'fake-jwt' })),
    getAuthedSupabase: vi.fn(),
  }))

  // Required so buildServiceSupabase doesn't throw.
  process.env.SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

  const { POST } = await import('./route')
  return { POST, fromFn }
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetModules()
})

describe('POST /api/settings/save — contactChannels validation', () => {
  it('accepts an empty contactChannels array', async () => {
    const { POST } = await setup()
    const res = await POST(makeReq({ locationId: LOC_ID, contactChannels: [] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('accepts a valid 3-channel payload', async () => {
    const { POST } = await setup()
    const channels = [
      { id: 'a', label: 'Email', value: 'hi@pinks.com', when_to_use: 'menu questions' },
      { id: 'b', label: 'WhatsApp', value: '+34600000000', when_to_use: 'urgent issues' },
      { id: 'c', label: 'Instagram', value: '@pinks', when_to_use: 'social mentions' },
    ]
    const res = await POST(makeReq({ locationId: LOC_ID, contactChannels: channels }))
    expect(res.status).toBe(200)
  })

  it('rejects a payload with more than 5 channels', async () => {
    const { POST } = await setup()
    const channels = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      label: `Label ${i}`,
      value: `value-${i}@pinks.com`,
      when_to_use: `case ${i}`,
    }))
    const res = await POST(makeReq({ locationId: LOC_ID, contactChannels: channels }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/maximum 5 channels/i)
  })

  it('rejects a channel with empty when_to_use', async () => {
    const { POST } = await setup()
    const channels = [
      { id: 'a', label: 'Email', value: 'hi@pinks.com', when_to_use: '   ' },
    ]
    const res = await POST(makeReq({ locationId: LOC_ID, contactChannels: channels }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/when_to_use is required/i)
  })

  it('rejects a label that exceeds the length cap', async () => {
    const { POST } = await setup()
    const channels = [
      { id: 'a', label: 'A'.repeat(101), value: 'hi@pinks.com', when_to_use: 'urgent' },
    ]
    const res = await POST(makeReq({ locationId: LOC_ID, contactChannels: channels }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/label must be 100 characters/i)
  })

  it('rejects a non-array contactChannels value', async () => {
    const { POST } = await setup()
    const res = await POST(makeReq({ locationId: LOC_ID, contactChannels: 'not-an-array' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/must be an array/i)
  })
})
