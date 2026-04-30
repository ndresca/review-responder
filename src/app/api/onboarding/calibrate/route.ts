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

const BASE_CALIBRATION_SCENARIOS: ScenarioType[] = [
  '5star',
  '4star_minor',
  '3star_mixed',
  '1star_harsh',
  'complaint_food',
  'complaint_service',
]

/**
 * Returns the 6 calibration scenarios used during onboarding.
 *
 * For non-English locations we swap `complaint_service` for `multilingual` so
 * the owner sees at least one example written in their actual language during
 * calibration — otherwise a Spanish/French restaurant would calibrate the AI
 * entirely on English samples and never sanity-check the language behavior.
 */
function getCalibrationScenarios(language: string): ScenarioType[] {
  if (language !== 'en') {
    return BASE_CALIBRATION_SCENARIOS.map(s => s === 'complaint_service' ? 'multilingual' : s)
  }
  return BASE_CALIBRATION_SCENARIOS
}

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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Resolves the access token for a location, refreshing if needed.
 * Uses a database-level lock (refreshing_since column) to prevent concurrent
 * refreshes from cron and calibration — Google invalidates the old refresh token
 * on use, so two simultaneous refreshes cause invalid_grant errors.
 */
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
    const LOCK_TIMEOUT_MS = 60_000
    const now = new Date()

    // Try to acquire the lock: set refreshing_since only if null or stale
    const { data: locked, error: lockErr } = await supabase
      .from('oauth_tokens')
      .update({ refreshing_since: now.toISOString() })
      .eq('location_id', locationId)
      .or(`refreshing_since.is.null,refreshing_since.lt.${new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString()}`)
      .select('refresh_token_encrypted, refresh_token_iv')
      .maybeSingle()

    if (lockErr) throw new Error(`resolveAccessToken: lock failed for ${locationId}: ${lockErr.message}`)

    if (!locked) {
      // Another process is refreshing. Wait briefly then re-read the fresh token.
      await sleep(2000)
      const { data: freshRow, error: freshErr } = await supabase
        .from('oauth_tokens')
        .select('access_token_encrypted, access_token_iv')
        .eq('location_id', locationId)
        .single()
      if (freshErr || !freshRow) throw new Error(`resolveAccessToken: re-read failed for ${locationId}`)
      return decrypt(freshRow.access_token_encrypted as string, freshRow.access_token_iv as string)
    }

    // We hold the lock. Refresh the token.
    try {
      const refreshToken = decrypt(locked.refresh_token_encrypted as string, locked.refresh_token_iv as string)
      const refreshed = await refreshOAuthToken(refreshToken)

      const { ciphertext, iv } = encrypt(refreshed.accessToken)
      const { error: updateErr } = await supabase
        .from('oauth_tokens')
        .update({
          access_token_encrypted: ciphertext,
          access_token_iv: iv,
          expires_at: refreshed.expiresAt.toISOString(),
          refreshing_since: null, // release the lock
        })
        .eq('location_id', locationId)

      if (updateErr) throw new Error(`resolveAccessToken: token refresh DB update failed for ${locationId}: ${updateErr.message}`)
      return refreshed.accessToken
    } catch (err) {
      // Release the lock on failure
      await supabase
        .from('oauth_tokens')
        .update({ refreshing_since: null })
        .eq('location_id', locationId)
      throw err
    }
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
  ownerFeedback?: string,
): Promise<CalibrationOutput> {
  const prompt = buildCalibrationPrompt(brandVoice, existingResponses, scenario, ownerFeedback)

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

  // Per-user rate limit: max 3 calibration sessions per location per hour.
  // Each session fires 6 OpenAI calls (~$0.40 each) so an unauthenticated
  // bill-attack is the worst case, but even authed-but-malicious is worth
  // bounding. Enforced by counting calibration_sessions rows created in the
  // last 60 minutes.
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentSessions, error: rateErr } = await supabase
    .from('calibration_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', locationId)
    .gte('created_at', oneHourAgoIso)

  if (rateErr) {
    console.error('calibrate POST: rate-limit count failed:', rateErr.message)
    return NextResponse.json({ error: 'Failed to check rate limit' }, { status: 500 })
  }
  if ((recentSessions ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Too many calibration attempts. Please wait before trying again.' },
      { status: 429 },
    )
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

  // Generate the 6 examples sequentially with a small delay between each.
  // Bare Promise.all hammered OpenAI's tier limits and rejected the entire
  // session on a single 429. Now: each call is awaited, errors are caught
  // per-scenario (the rest still proceed), and we only fail the whole
  // session if fewer than 3 examples succeed (calibration's >=3 gate would
  // never be reachable below that anyway).
  const openai = buildOpenAI()
  const scenarios = getCalibrationScenarios(brandVoice.language)
  const outputs: (CalibrationOutput & { scenario: ScenarioType })[] = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    if (i > 0) await sleep(300)
    try {
      const output = await generateExample(openai, brandVoice, existingResponses, scenario)
      outputs.push({ ...output, scenario })
    } catch (err) {
      console.error(`calibration: generateExample failed for scenario ${scenario}:`, err)
      // Skip this scenario and continue with the next — partial generations
      // are still useful as long as we end up with >=3.
    }
  }

  if (outputs.length < 3) {
    return NextResponse.json(
      { error: `Generated only ${outputs.length} of ${scenarios.length} calibration examples — at least 3 are required to proceed. Try again in a moment.` },
      { status: 502 },
    )
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
  let feedbackText: string | undefined

  try {
    const body = (await request.json()) as {
      exampleId?: string
      decision?: string
      editedText?: string
      feedbackText?: string
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
    // Cap editedText at 2000 chars to bound prompt size and prevent runaway
    // input from blowing up the regen call. The schema column is plain text
    // (no length limit), so this is the enforcement point.
    editedText = body.editedText?.slice(0, 2000)
    // Optional free-form note from the owner about why the previous response
    // missed the mark — flows into the regen prompt as an extra guideline.
    // Cap at 500 chars to keep the prompt focused and prevent injection of
    // arbitrarily large strings into the LLM call.
    feedbackText = body.feedbackText?.trim().slice(0, 500) || undefined
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = buildServiceSupabase()

  // Load example and verify it belongs to an owned location.
  // We load scenario_type here too because edit/reject triggers a regen for the same scenario.
  const { data: example, error: exErr } = await supabase
    .from('calibration_examples')
    .select('id, session_id, location_id, scenario_type')
    .eq('id', exampleId)
    .single()

  if (exErr || !example) return NextResponse.json({ error: 'Example not found' }, { status: 404 })

  const locId = example.location_id as string
  // We need google_location_id for the GBP fetch during regen — fold it into the same query.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id, google_location_id')
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
  const { error: bvCountErr } = await supabase
    .from('brand_voices')
    .update({ calibration_examples_accepted: acceptedCount })
    .eq('location_id', locId)

  if (bvCountErr) {
    // Count is recoverable on next PATCH — don't block Go Live over a transient counter update
    console.warn('update brand_voices calibration_examples_accepted failed:', bvCountErr)
  }

  if (calibrationComplete) {
    const [sessionResult, brandVoiceResult] = await Promise.all([
      supabase
        .from('calibration_sessions')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', example.session_id as string),
      supabase
        .from('brand_voices')
        .update({ calibrated_at: new Date().toISOString(), auto_post_enabled: false })
        .eq('location_id', locId),
    ])
    if (sessionResult.error || brandVoiceResult.error) {
      console.error('calibration completion writes failed:', sessionResult.error, brandVoiceResult.error)
      return NextResponse.json({ error: 'Calibration complete but failed to save state — retry' }, { status: 500 })
    }
  }

  // ── Regeneration after edit/reject ─────────────────────────────────────────
  // Whenever the owner edits or rejects a card, generate a fresh AI attempt for
  // the same scenario so the UI can offer them another option to consider.
  // The original decision has already been recorded above — regen failure is
  // non-fatal: we return newExample: null and let the UI handle the empty slot.
  let newExample: {
    id: string
    scenario_type: ScenarioType
    review_sample: string
    ai_response: string
    decision: string
  } | null = null

  if (decision === 'edited' || decision === 'rejected') {
    try {
      newExample = await regenerateExample(
        supabase,
        locId,
        location.google_location_id as string,
        example.session_id as string,
        example.scenario_type as ScenarioType,
        feedbackText,
      )
    } catch (err) {
      // Non-fatal — log and return null. The decision write above succeeded.
      console.error('regenerate after decision failed:', err)
    }
  }

  return NextResponse.json({ calibrationComplete, acceptedCount, newExample })
}

// ─── Regeneration helper ─────────────────────────────────────────────────────
// Loads brand voice, refreshes the access token if needed, fetches existing GBP
// responses for few-shot context, generates one new example for the requested
// scenario, and inserts it as a new pending row in the same calibration session.
async function regenerateExample(
  supabase: SupabaseClient<any>,
  locationId: string,
  googleLocationId: string,
  sessionId: string,
  scenario: ScenarioType,
  ownerFeedback?: string,
): Promise<{
  id: string
  scenario_type: ScenarioType
  review_sample: string
  ai_response: string
  decision: string
}> {
  // Load brand voice
  const { data: bvRow, error: bvErr } = await supabase
    .from('brand_voices')
    .select('personality, avoid, signature_phrases, language, owner_description')
    .eq('location_id', locationId)
    .single()

  if (bvErr || !bvRow) throw new Error(`regenerateExample: brand voice not found for ${locationId}`)

  const brandVoice: BrandVoice = {
    personality: bvRow.personality as string,
    avoid: bvRow.avoid as string,
    signature_phrases: bvRow.signature_phrases as string[],
    language: bvRow.language as string,
    owner_description: bvRow.owner_description as string | null,
  }

  // Resolve access token (refreshes if expiring)
  const accessToken = await resolveAccessToken(supabase, locationId)

  // Best-effort GBP fetch for few-shot context — same pattern as POST.
  // Calibration still works without it; the prompt just has less personalization.
  let existingResponses: ExistingResponse[] = []
  try {
    const allReviews = await fetchAllReviewsFirstPage(googleLocationId, accessToken)
    existingResponses = allReviews
      .filter(r => r.reviewReply?.comment)
      .map(r => ({
        review_text: r.comment ?? '',
        review_rating: STAR_RATING[r.starRating] ?? 0,
        response_text: r.reviewReply!.comment,
      }))
  } catch (err) {
    console.warn('regenerateExample: fetchAllReviews failed (continuing without examples):', err)
  }

  // Generate one new example for the requested scenario, optionally guided by
  // the owner's free-form feedback about what was wrong with the previous one.
  const openai = buildOpenAI()
  const output = await generateExample(openai, brandVoice, existingResponses, scenario, ownerFeedback)

  // Insert as a new pending row in the same session
  const { data: inserted, error: insertErr } = await supabase
    .from('calibration_examples')
    .insert({
      session_id: sessionId,
      location_id: locationId,
      scenario_type: scenario,
      review_sample: output.review_sample,
      ai_response: output.ai_response,
      decision: 'pending',
    })
    .select('id, scenario_type, review_sample, ai_response, decision')
    .single()

  if (insertErr || !inserted) {
    throw new Error(`regenerateExample: insert failed — ${insertErr?.message ?? 'no row returned'}`)
  }

  return inserted as {
    id: string
    scenario_type: ScenarioType
    review_sample: string
    ai_response: string
    decision: string
  }
}
