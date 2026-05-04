import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { BrandVoice, CalibrationExample, Review } from '@/lib/types'

// ─── Test fixtures ──────────────────────────────────────────────────────────

const LOC_ID = '00000000-0000-0000-0000-000000000001'
const GOOGLE_LOC_ID = 'accounts/123/locations/456'

const BRAND_VOICE: BrandVoice = {
  personality: 'warm, local',
  avoid: 'we apologise for any inconvenience',
  signature_phrases: ['cheers'],
  language: 'en',
  auto_detect_language: false,
  owner_description: 'Neighbourhood Italian spot',
  contact_channels: [],
}

const REVIEW: Review = {
  google_review_id: 'review-abc',
  reviewer_name: 'Alice',
  rating: 5,
  text: 'Amazing carbonara, will be back!',
  created_at: '2026-04-01T12:00:00Z',
}

const VALID_RESPONSE = 'Thank you so much! The carbonara is our pride and joy.'
const SHORT_RESPONSE = 'Thanks!'
const LONG_RESPONSE = 'A'.repeat(301)

const TOKEN_ROW = {
  access_token_encrypted: 'enc-access',
  access_token_iv: 'iv-access',
  refresh_token_encrypted: 'enc-refresh',
  refresh_token_iv: 'iv-refresh',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}

const EXPIRED_TOKEN_ROW = {
  ...TOKEN_ROW,
  expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
}

// ─── Supabase mock builder ──────────────────────────────────────────────────

function mockQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, Mock> = {}
  const makeProxy = (): any => new Proxy(function () {}, {
    get: (_, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
      return chain[prop as string]
    },
  })

  for (const method of ['from', 'select', 'eq', 'in', 'or', 'gte', 'lte', 'order', 'limit', 'insert', 'update', 'upsert']) {
    chain[method] = vi.fn().mockReturnValue(makeProxy())
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return { chain, entry: makeProxy() }
}

function buildSupabaseFrom(tableResults: Record<string, { data: unknown; error: unknown }>) {
  return vi.fn().mockImplementation((table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    return mockQuery(result).entry
  })
}

// ─── Setup helper ───────────────────────────────────────────────────────────

const DEFAULT_TABLES = {
  oauth_tokens: { data: TOKEN_ROW, error: null },
  locations: { data: { google_location_id: GOOGLE_LOC_ID }, error: null },
  brand_voices: { data: { ...BRAND_VOICE, auto_post_enabled: true }, error: null },
  calibration_examples: { data: [], error: null },
  responses_posted: { data: null, error: null },
}

async function setup(opts: {
  tables?: Record<string, { data: unknown; error: unknown }>
  openai?: Array<{ content: string }>
  fromOverride?: Mock
}) {
  vi.resetModules()

  const mockCreate = vi.fn()
  for (const r of opts.openai ?? []) {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: r.content } }] })
  }

  const fromFn = opts.fromOverride ?? buildSupabaseFrom(opts.tables ?? DEFAULT_TABLES)

  vi.doMock('openai', () => ({ default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })) }))
  vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: fromFn })) }))
  vi.doMock('@/lib/crypto', () => ({
    encrypt: vi.fn(() => ({ ciphertext: 'new-enc', iv: 'new-iv' })),
    decrypt: vi.fn(() => 'decrypted-access-token'),
  }))
  vi.doMock('@/lib/gbp-client', () => ({
    fetchReviews: vi.fn().mockResolvedValue([]),
    postReply: vi.fn().mockResolvedValue(undefined),
    refreshOAuthToken: vi.fn().mockResolvedValue({ accessToken: 'new-token', expiresAt: new Date(Date.now() + 3600_000) }),
  }))
  vi.doMock('@/prompts/generate-response', () => ({ buildGeneratePrompt: vi.fn(() => 'prompt') }))
  vi.doMock('@/prompts/quality-check', () => ({ buildQualityCheckPrompt: vi.fn(() => 'qc prompt') }))
  vi.doMock('@/services/digest', () => ({ sendFailureAlert: vi.fn().mockResolvedValue(undefined) }))

  const mod = await import('./auto-post')
  const gbp = await import('@/lib/gbp-client')
  const crypto = await import('@/lib/crypto')
  const digest = await import('@/services/digest')

  return {
    processLocation: mod.processLocation,
    mockCreate,
    fetchReviews: gbp.fetchReviews as Mock,
    postReply: gbp.postReply as Mock,
    refreshOAuthToken: gbp.refreshOAuthToken as Mock,
    encrypt: crypto.encrypt as Mock,
    decrypt: crypto.decrypt as Mock,
    sendFailureAlert: digest.sendFailureAlert as Mock,
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  process.env.OPENAI_API_KEY = 'test-openai-key'
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('processLocation', () => {
  it('happy path: fetches reviews, generates, passes quality gate, posts', async () => {
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [
        { content: VALID_RESPONSE },
        { content: JSON.stringify({ pass: true, reason: '' }) },
      ],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.fetchReviews).toHaveBeenCalledWith(GOOGLE_LOC_ID, 'decrypted-access-token')
    expect(s.postReply).toHaveBeenCalledWith(GOOGLE_LOC_ID, 'review-abc', VALID_RESPONSE, 'decrypted-access-token')
  })

  it('skips reviews that already have a response (idempotency)', async () => {
    const s = await setup({
      tables: { ...DEFAULT_TABLES, responses_posted: { data: { id: 'existing' }, error: null } },
      openai: [],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.mockCreate).not.toHaveBeenCalled()
    expect(s.postReply).not.toHaveBeenCalled()
  })

  it('returns early when auto_post_enabled is false', async () => {
    const s = await setup({
      tables: { ...DEFAULT_TABLES, brand_voices: { data: { ...BRAND_VOICE, auto_post_enabled: false }, error: null } },
      openai: [],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })

  it('returns early when no unanswered reviews exist', async () => {
    const s = await setup({ tables: DEFAULT_TABLES, openai: [] })

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })
})

describe('quality gate', () => {
  it('blocks too-short response after regen also fails', async () => {
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [{ content: SHORT_RESPONSE }, { content: SHORT_RESPONSE }],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })

  it('blocks response containing a forbidden phrase', async () => {
    const forbidden = 'We apologise for any inconvenience, but the carbonara takes time.'
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [{ content: forbidden }, { content: forbidden }],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })

  it('regens once if first attempt fails, then posts if regen passes', async () => {
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [
        { content: LONG_RESPONSE },       // first gen: too long
        { content: VALID_RESPONSE },       // regen: valid
        { content: JSON.stringify({ pass: true, reason: '' }) }, // LLM QC: pass
      ],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.mockCreate).toHaveBeenCalledTimes(3)
    expect(s.postReply).toHaveBeenCalledWith(GOOGLE_LOC_ID, 'review-abc', VALID_RESPONSE, 'decrypted-access-token')
  })

  it('blocks when LLM quality check returns { pass: false }', async () => {
    const response = 'Thank you for dining with us, we value your patronage.'
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [
        { content: response },
        { content: JSON.stringify({ pass: false, reason: 'Too corporate' }) },
        { content: response },
        { content: JSON.stringify({ pass: false, reason: 'Still corporate' }) },
      ],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })

  it('blocks when LLM quality check returns unparseable response (fail-safe)', async () => {
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [
        { content: VALID_RESPONSE }, { content: 'not json' },
        { content: VALID_RESPONSE }, { content: '????' },
      ],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })
})

describe('post failure handling', () => {
  it('retries 3 times then stores failure and sends alert', async () => {
    const s = await setup({
      tables: DEFAULT_TABLES,
      openai: [
        { content: VALID_RESPONSE },
        { content: JSON.stringify({ pass: true, reason: '' }) },
      ],
    })
    s.fetchReviews.mockResolvedValue([REVIEW])
    s.postReply.mockRejectedValue(new Error('GBP API 500'))

    await s.processLocation(LOC_ID)

    expect(s.postReply).toHaveBeenCalledTimes(3)
    expect(s.sendFailureAlert).toHaveBeenCalledWith(LOC_ID, 'review-abc', VALID_RESPONSE)
  })
})

describe('token refresh lock', () => {
  it('refreshes token when expired and acquires lock', async () => {
    const s = await setup({
      tables: { ...DEFAULT_TABLES, oauth_tokens: { data: EXPIRED_TOKEN_ROW, error: null } },
      openai: [],
    })
    s.decrypt.mockReturnValue('decrypted-refresh-token')

    await s.processLocation(LOC_ID)

    expect(s.refreshOAuthToken).toHaveBeenCalledWith('decrypted-refresh-token')
    expect(s.encrypt).toHaveBeenCalled()
  })

  it('skips refresh when token is not expired', async () => {
    const s = await setup({ tables: DEFAULT_TABLES, openai: [] })

    await s.processLocation(LOC_ID)

    expect(s.refreshOAuthToken).not.toHaveBeenCalled()
  })

  it('waits and re-reads when lock is held by another process', async () => {
    let oauthCallCount = 0
    const fromOverride = vi.fn().mockImplementation((table: string) => {
      if (table === 'oauth_tokens') {
        oauthCallCount++
        if (oauthCallCount === 1) return mockQuery({ data: EXPIRED_TOKEN_ROW, error: null }).entry
        if (oauthCallCount === 2) return mockQuery({ data: null, error: null }).entry // lock held
        return mockQuery({ data: TOKEN_ROW, error: null }).entry // fresh after wait
      }
      if (table === 'locations') return mockQuery({ data: { google_location_id: GOOGLE_LOC_ID }, error: null }).entry
      return mockQuery({ data: null, error: null }).entry
    })

    const s = await setup({ openai: [], fromOverride })

    await s.processLocation(LOC_ID)

    expect(s.refreshOAuthToken).not.toHaveBeenCalled()
    expect(oauthCallCount).toBeGreaterThanOrEqual(3)
  }, 10_000)
})

describe('duplicate detection', () => {
  it('blocks response identical to last posted text', async () => {
    const dupeText = 'Already posted this exact response before.'
    let responsesCount = 0
    const fromOverride = vi.fn().mockImplementation((table: string) => {
      if (table === 'responses_posted') {
        responsesCount++
        if (responsesCount === 1) return mockQuery({ data: null, error: null }).entry // hasExisting: no
        if (responsesCount === 2) return mockQuery({ data: { text: dupeText }, error: null }).entry // lastPosted
        return mockQuery({ data: null, error: null }).entry
      }
      if (table === 'oauth_tokens') return mockQuery({ data: TOKEN_ROW, error: null }).entry
      if (table === 'locations') return mockQuery({ data: { google_location_id: GOOGLE_LOC_ID }, error: null }).entry
      if (table === 'brand_voices') return mockQuery({ data: { ...BRAND_VOICE, auto_post_enabled: true }, error: null }).entry
      if (table === 'calibration_examples') return mockQuery({ data: [], error: null }).entry
      return mockQuery({ data: null, error: null }).entry
    })

    const s = await setup({
      openai: [{ content: dupeText }, { content: dupeText }],
      fromOverride,
    })
    s.fetchReviews.mockResolvedValue([REVIEW])

    await s.processLocation(LOC_ID)

    expect(s.postReply).not.toHaveBeenCalled()
  })
})
