import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { decrypt, encrypt } from '@/lib/crypto'
import { refreshOAuthToken } from '@/lib/gbp-client'
import { buildCalibrationPrompt } from '@/prompts/calibration'
import type { BrandVoice, ExistingResponse, ScenarioType } from '@/lib/types'

// ─── Config ──────────────────────────────────────────────────────────────────

const CALIBRATION_SCENARIOS: ScenarioType[] = [
  '5star',
  '4star_minor',
  '3star_mixed',
  '1star_harsh',
  'complaint_food',
  'complaint_service',
]

const GBP_BASE = 'https://mybusiness.googleapis.com/v4'

const STAR_RATING: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

function buildOpenAI() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return new OpenAI({ apiKey: key })
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthUser() {
  const cookieStore = await cookies()
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ─── GBP reviews fetch (all reviews, including already-replied) ───────────────
// Used only during calibration to extract ExistingResponse[] few-shot examples.
// fetchReviews() in gbp-client.ts filters to unanswered only — not what we want here.

type GbpReview = {
  reviewId: string
  reviewer: { displayName: string }
  starRating: string
  comment?: string
  createTime: string
  reviewReply?: { comment: string }
}

async function fetchAllReviewsFirstPage(
  googleLocationId: string,
  accessToken: string,
): Promise<GbpReview[]> {
  const url = new URL(`${GBP_BASE}/${googleLocationId}/reviews`)
  url.searchParams.set('pageSize', '50')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`fetchAllReviews: HTTP ${res.status} — ${body}`)
  }

  const page = (await res.json()) as { reviews?: GbpReview[] }
  return page.reviews ?? []
}

// ─── Token resolution (mirrors processLocation in auto-post.ts) ──────────────

async function resolveAccessToken(
  supabase: SupabaseClient<any>,
  locationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('access_token_encrypted, access_token_iv, refresh_token_encrypted, refresh_token_iv, expires_at')
    .eq('location_id', locationId)
    .single()

  if (error || !data) throw new Error(`oauth tokens not found for ${locationId}`)

  const row = data as {
    access_token_encrypted: string
    access_token_iv: string
    refresh_token_encrypted: string
    refresh_token_iv: string
    expires_at: string
  }

  const expiresAt = new Date(row.expires_at)
  const fiveMinutes = 5 * 60 * 1000

  if (expiresAt.getTime() - Date.now() <= fiveMinutes) {
    const refreshToken = decrypt(row.refresh_token_encrypted, row.refresh_token_iv)
    const refreshed = await refreshOAuthToken(refreshToken)

    const { ciphertext, iv } = encrypt(refreshed.accessToken)
    await supabase
      .from('oauth_tokens')
      .update({
        access_token_encrypted: ciphertext,
        access_token_iv: iv,
        expires_at: refreshed.expiresAt.toISOString(),
      })
      .eq('location_id', locationId)

    return refreshed.accessToken
  }

  return decrypt(row.access_token_encrypted, row.access_token_iv)
}

// ─── OpenAI generation ────────────────────────────────────────────────────────

type CalibrationOutput = { review_sample: string; ai_response: string }

async function generateExample(
  openai: OpenAI,
  brandVoice: BrandVoice,
  existingResponses: ExistingResponse[],
  scenario: ScenarioType,
): Promise<CalibrationOutput> {
  const prompt = buildCalibrationPrompt(brandVoice, existingResponses, scenario)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  })

  const raw = completion.choices[0]?.message.content?.trim() ?? ''
  const parsed = JSON.parse(raw) as CalibrationOutput

  if (!parsed.review_sample || !parsed.ai_response) {
    throw new Error(`malformed calibration output for scenario ${scenario}: ${raw}`)
  }

  return parsed
}

// ─── POST — generate calibration examples ─────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let locationId: string
  try {
    const body = (await request.json()) as { locationId?: string }
    if (!body.locationId) return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    locationId = body.locationId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = buildServiceSupabase()

  // Verify ownership
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('id, google_location_id, owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  if ((location.owner_id as string) !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Load brand voice
  const { data: bvRow, error: bvErr } = await supabase
    .from('brand_voices')
    .select('personality, avoid, signature_phrases, language, owner_description')
    .eq('location_id', locationId)
    .single()

  if (bvErr || !bvRow) return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })

  const brandVoice: BrandVoice = {
    personality: bvRow.personality as string,
    avoid: bvRow.avoid as string,
    signature_phrases: bvRow.signature_phrases as string[],
    language: bvRow.language as string,
    owner_description: bvRow.owner_description as string | null,
  }

  // Resolve access token
  let accessToken: string
  try {
    accessToken = await resolveAccessToken(supabase, locationId)
  } catch (err) {
    console.error('resolveAccessToken failed:', err)
    return NextResponse.json({ error: 'Failed to load Google credentials' }, { status: 502 })
  }

  // Fetch GBP reviews (all, including replied) for few-shot context
  let existingResponses: ExistingResponse[] = []
  try {
    const allReviews = await fetchAllReviewsFirstPage(location.google_location_id as string, accessToken)
    existingResponses = allReviews
      .filter(r => r.reviewReply?.comment)
      .map(r => ({
        review_text: r.comment ?? '',
        review_rating: STAR_RATING[r.starRating] ?? 0,
        response_text: r.reviewReply!.comment,
      }))
  } catch (err) {
    // Non-fatal — calibration works without existing responses, just less personalized
    console.warn('fetchAllReviews failed (continuing without examples):', err)
  }

  // Create calibration session
  const { data: session, error: sessionErr } = await supabase
    .from('calibration_sessions')
    .insert({ location_id: locationId, status: 'in_progress' })
    .select('id')
    .single()

  if (sessionErr || !session) {
    console.error('create calibration_session failed:', sessionErr)
    return NextResponse.json({ error: 'Failed to create calibration session' }, { status: 500 })
  }
  const sessionId = session.id as string

  // Generate all 6 examples in parallel
  const openai = buildOpenAI()
  let outputs: (CalibrationOutput & { scenario: ScenarioType })[]
  try {
    const results = await Promise.all(
      CALIBRATION_SCENARIOS.map(async scenario => {
        const output = await generateExample(openai, brandVoice, existingResponses, scenario)
        return { ...output, scenario }
      }),
    )
    outputs = results
  } catch (err) {
    console.error('calibration generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate calibration examples' }, { status: 502 })
  }

  // Store all 6 in calibration_examples
  const rows = outputs.map(o => ({
    session_id: sessionId,
    location_id: locationId,
    scenario_type: o.scenario,
    review_sample: o.review_sample,
    ai_response: o.ai_response,
    decision: 'pending',
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from('calibration_examples')
    .insert(rows)
    .select('id, scenario_type, review_sample, ai_response, decision')

  if (insertErr || !inserted) {
    console.error('insert calibration_examples failed:', insertErr)
    return NextResponse.json({ error: 'Failed to store calibration examples' }, { status: 500 })
  }

  return NextResponse.json({ sessionId, examples: inserted })
}

// ─── PATCH — record owner decision ────────────────────────────────────────────

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let exampleId: string
  let decision: 'accepted' | 'rejected' | 'edited'
  let editedText: string | undefined

  try {
    const body = (await request.json()) as {
      exampleId?: string
      decision?: string
      editedText?: string
    }

    if (!body.exampleId) return NextResponse.json({ error: 'exampleId is required' }, { status: 400 })
    if (!body.decision || !['accepted', 'rejected', 'edited'].includes(body.decision)) {
      return NextResponse.json({ error: 'decision must be accepted | rejected | edited' }, { status: 400 })
    }
    if (body.decision === 'edited' && !body.editedText?.trim()) {
      return NextResponse.json({ error: 'editedText is required when decision is edited' }, { status: 400 })
    }

    exampleId = body.exampleId
    decision = body.decision as typeof decision
    editedText = body.editedText
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = buildServiceSupabase()

  // Load example and verify it belongs to an owned location
  const { data: example, error: exErr } = await supabase
    .from('calibration_examples')
    .select('id, session_id, location_id')
    .eq('id', exampleId)
    .single()

  if (exErr || !example) return NextResponse.json({ error: 'Example not found' }, { status: 404 })

  const locId = example.location_id as string
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id')
    .eq('id', locId)
    .single()

  if (locErr || !location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  if ((location.owner_id as string) !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Apply the decision
  const update: Record<string, unknown> = { decision }
  if (decision === 'edited' && editedText) update.edited_text = editedText

  const { error: updateErr } = await supabase
    .from('calibration_examples')
    .update(update)
    .eq('id', exampleId)

  if (updateErr) {
    console.error('update calibration_example failed:', updateErr)
    return NextResponse.json({ error: 'Failed to save decision' }, { status: 500 })
  }

  // Count accepted + edited examples for this session
  const { count, error: countErr } = await supabase
    .from('calibration_examples')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', example.session_id as string)
    .in('decision', ['accepted', 'edited'])

  if (countErr) {
    console.error('count calibration_examples failed:', countErr)
    return NextResponse.json({ error: 'Failed to count accepted examples' }, { status: 500 })
  }

  const acceptedCount = count ?? 0
  const calibrationComplete = acceptedCount >= 3

  // Update brand_voices regardless — keeps the count in sync for the Go Live check
  await supabase
    .from('brand_voices')
    .update({ calibration_examples_accepted: acceptedCount })
    .eq('location_id', locId)

  if (calibrationComplete) {
    await Promise.all([
      supabase
        .from('calibration_sessions')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', example.session_id as string),
      supabase
        .from('brand_voices')
        .update({ calibrated_at: new Date().toISOString(), auto_post_enabled: false })
        .eq('location_id', locId),
    ])
  }

  return NextResponse.json({ calibrationComplete, acceptedCount })
}
