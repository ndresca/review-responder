import type { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { decrypt, encrypt } from '@/lib/crypto'
import { refreshOAuthToken } from '@/lib/gbp-client'
import { checkOutputAllowlist } from '@/lib/output-allowlist'
import { classifyReviewSafety } from '@/lib/review-safety'
import { buildCalibrationPrompt } from '@/prompts/calibration'
import type {
  BrandVoice,
  CalibrationExample,
  ContactChannel,
  ExistingResponse,
  ScenarioType,
} from '@/lib/types'

// Calibration regeneration helpers — extracted from
// src/app/api/onboarding/calibrate/route.ts so the sibling
// regenerate route (POST /api/onboarding/calibrate/regenerate, used by
// the calibration step 3 "Edit brand voice" panel) can reuse the same
// prompt build + allowlist validation + insert shape without
// duplicating ~250 LOC of security-critical logic.
//
// Next.js App Router rejects extra named exports from `route.ts` files
// (it generates a strict types-check that only allows HTTP method
// handlers + runtime/dynamic config). Living in a sibling lib lets both
// route files import these helpers as plain ES modules.
//
// Co-located in src/services/ (alongside auto-post.ts) because these
// are not pure-data utilities — they own the "calibration runs OpenAI"
// side-effect. Naming intentionally generic (calibration.ts, not
// calibration-regen.ts) since this file owns multiple stages of the
// calibration pipeline (token resolution, GBP fetch + classifier
// filter, prompt build, output validation, regen).

const GBP_BASE = 'https://mybusiness.googleapis.com/v4'

const STAR_RATING: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

// ─── OpenAI client ────────────────────────────────────────────────────────────

export function buildOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return new OpenAI({ apiKey: key })
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

// ─── Shared GBP-fetch + classifier filter ────────────────────────────────────
//
// Both the POST handler (initial calibration) and the regenerateExample
// helper need the same flow: fetch GBP reviews, drop the owner-replied
// ones into the few-shot pool, and strip anything that looks like a
// prompt-injection attempt before it reaches the LLM. Putting it here
// means the next code path that needs few-shot context can't ship
// without the classifier by construction.
//
// Layer 1 of the three-layer defense (classifier + delimiter wrap +
// output allowlist). Mirrors src/services/auto-post.ts's pre-generation
// filter.
export async function fetchAndFilterReviews(
  googleLocationId: string,
  accessToken: string,
): Promise<ExistingResponse[]> {
  const allReviews = await fetchAllReviewsFirstPage(googleLocationId, accessToken)
  const candidates = allReviews
    .filter(r => r.reviewReply?.comment)
    .map(r => ({
      review_text: r.comment ?? '',
      review_rating: STAR_RATING[r.starRating] ?? 0,
      response_text: r.reviewReply!.comment,
    }))

  const safe: ExistingResponse[] = []
  let droppedCount = 0
  for (const r of candidates) {
    const verdict = classifyReviewSafety(r.review_text)
    if (verdict.safe) {
      safe.push(r)
    } else {
      droppedCount++
    }
  }
  if (droppedCount > 0) {
    console.warn(`fetchAndFilterReviews: dropped ${droppedCount} of ${candidates.length} GBP reviews flagged by classifyReviewSafety`)
  }
  return safe
}

// ─── Shared output-allowlist validator ───────────────────────────────────────
//
// Layer 3 of the three-layer defense. Builds a synthetic allowlist
// source from the owner's existing GBP replies (URLs/phones the owner
// has actually used) and rejects any generated ai_response that
// introduces a new URL or phone. Throws on failure so callers can route
// the rejection however they need (skip+continue in POST, surface to
// UI in PATCH and regenerate routes).

export function validateGeneratedExample(
  aiResponse: string,
  source: ExistingResponse[],
  allowedTokens: string[] = [],
): void {
  const allowlistSource: CalibrationExample[] = source.map(r => ({
    scenario_type: '5star',
    review_sample: r.review_text,
    ai_response: r.response_text,
  }))
  const outputCheck = checkOutputAllowlist(aiResponse, allowlistSource, allowedTokens)
  if (!outputCheck.pass) {
    throw new Error(`validateGeneratedExample: output rejected — ${outputCheck.reason ?? 'allowlist failed'}`)
  }
}

// ─── Token resolution (mirrors processLocation in auto-post.ts) ──────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Resolves the access token for a location, refreshing if needed.
 * Uses a database-level lock (refreshing_since column) to prevent concurrent
 * refreshes from cron and calibration — Google invalidates the old refresh token
 * on use, so two simultaneous refreshes cause invalid_grant errors.
 */
export async function resolveAccessToken(
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

export async function generateExample(
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

// ─── Regeneration helper ─────────────────────────────────────────────────────
// Loads brand voice, refreshes the access token if needed, fetches existing GBP
// responses for few-shot context, generates one new example for the requested
// scenario, and inserts it as a new pending row in the same calibration session.

export async function regenerateExample(
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
    .select('personality, avoid, signature_phrases, language, auto_detect_language, owner_description, contact_channels')
    .eq('location_id', locationId)
    .single()

  if (bvErr || !bvRow) throw new Error(`regenerateExample: brand voice not found for ${locationId}`)

  const brandVoice: BrandVoice = {
    personality: bvRow.personality as string,
    avoid: bvRow.avoid as string,
    signature_phrases: bvRow.signature_phrases as string[],
    language: bvRow.language as string,
    auto_detect_language: (bvRow.auto_detect_language as boolean | null) ?? false,
    owner_description: bvRow.owner_description as string | null,
    contact_channels: (bvRow.contact_channels as ContactChannel[] | null) ?? [],
  }

  // Resolve access token (refreshes if expiring)
  const accessToken = await resolveAccessToken(supabase, locationId)

  // Best-effort GBP fetch + Layer 1 classifier filter — same shared helper
  // as POST so the regenerate path can't drift.
  let existingResponses: ExistingResponse[] = []
  try {
    existingResponses = await fetchAndFilterReviews(googleLocationId, accessToken)
  } catch (err) {
    console.warn('regenerateExample: fetchAllReviews failed (continuing without examples):', err)
  }

  // Generate one new example for the requested scenario, optionally guided by
  // the owner's free-form feedback about what was wrong with the previous one.
  const openai = buildOpenAI()
  const output = await generateExample(openai, brandVoice, existingResponses, scenario, ownerFeedback)

  // Owner-allowlisted contact channels (PR B). Mirrors POST handler.
  const allowedTokens = brandVoice.contact_channels.map(c => c.value)

  // Layer 3 — output allowlist. Throws on failure; the PATCH handler's
  // try/catch wrapper turns that into a 502 so the UI can surface a clear
  // "regen produced unexpected content" message instead of saving a
  // potentially-poisoned example.
  validateGeneratedExample(output.ai_response, existingResponses, allowedTokens)

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
