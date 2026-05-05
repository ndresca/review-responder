import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  buildOpenAI,
  fetchAndFilterReviews,
  generateExample,
  regenerateExample,
  resolveAccessToken,
  validateGeneratedExample,
} from '@/services/calibration'
import { sanitizeForPrompt } from '@/lib/sanitize'
import type { BrandVoice, ContactChannel, ExistingResponse, ScenarioType } from '@/lib/types'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

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
    .select('personality, avoid, signature_phrases, language, auto_detect_language, owner_description, contact_channels')
    .eq('location_id', locationId)
    .single()

  if (bvErr || !bvRow) return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })

  const brandVoice: BrandVoice = {
    personality: bvRow.personality as string,
    avoid: bvRow.avoid as string,
    signature_phrases: bvRow.signature_phrases as string[],
    language: bvRow.language as string,
    auto_detect_language: (bvRow.auto_detect_language as boolean | null) ?? false,
    owner_description: bvRow.owner_description as string | null,
    // PR A foundation. The prompt builder doesn't read this yet (PR C wires
    // it into the GUIDELINES block); kept here so the type is honoured.
    contact_channels: (bvRow.contact_channels as ContactChannel[] | null) ?? [],
  }

  // Resolve access token
  let accessToken: string
  try {
    accessToken = await resolveAccessToken(supabase, locationId)
  } catch (err) {
    console.error('resolveAccessToken failed:', err)
    return NextResponse.json({ error: 'Failed to load Google credentials' }, { status: 502 })
  }

  // Fetch GBP reviews + apply prompt-injection classifier in one shot.
  // See fetchAndFilterReviews above — Layer 1 of the three-layer defense.
  let existingResponses: ExistingResponse[] = []
  try {
    existingResponses = await fetchAndFilterReviews(location.google_location_id as string, accessToken)
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
  const outputs: { scenario: ScenarioType; review_sample: string; ai_response: string }[] = []

  // Owner-allowlisted contact channels (PR B). When the contact_channels
  // array is empty (default for new users + anyone who hasn't configured
  // channels yet), this is [] and the validator behaves identically to
  // pre-PR-B — strict reject on any URL/phone/email/handle.
  const allowedTokens = brandVoice.contact_channels.map(c => c.value)

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]
    if (i > 0) await sleep(300)
    try {
      const output = await generateExample(openai, brandVoice, existingResponses, scenario)
      // Layer 3 — output allowlist. validateGeneratedExample throws on
      // failure; the catch below routes that to "skip + continue" so a
      // single allowlist rejection doesn't kill the whole session.
      validateGeneratedExample(output.ai_response, existingResponses, allowedTokens)
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
    // Cap editedText at 2000 chars to bound prompt size, then sanitize
    // injection-shaped lines before storing. This is the value that becomes
    // calibration_examples.edited_text and feeds back into future generate
    // prompts as a few-shot example, so it needs the same scrubbing as
    // brand-voice fields. Empty after sanitize → undefined (the empty-check
    // above already returned 400 for trim-empty input, but sanitize can
    // also produce empty if the entire input was injection-shaped).
    {
      const capped = body.editedText?.slice(0, 2000)
      const sanitized = sanitizeForPrompt(capped)
      editedText = sanitized || undefined
    }
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
