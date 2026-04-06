import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { encrypt, decrypt } from '@/lib/crypto'
import { fetchReviews, postReply, refreshOAuthToken } from '@/lib/gbp-client'
import { buildGeneratePrompt } from '@/prompts/generate-response'
import { buildQualityCheckPrompt, type QualityCheckResult } from '@/prompts/quality-check'
import { sendFailureAlert } from '@/services/digest'
import type { BrandVoice, CalibrationExample, Review } from '@/lib/types'

// ─── Clients ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: ReturnType<typeof createClient<any>> | undefined
let _openai: OpenAI | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabase(): ReturnType<typeof createClient<any>> {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    _supabase = createClient(url, key)
  }
  return _supabase
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY is not set')
    _openai = new OpenAI({ apiKey: key })
  }
  return _openai
}

// ─── DB row shapes ───────────────────────────────────────────────────────────

type OAuthTokenRow = {
  access_token_encrypted: string
  access_token_iv: string
  refresh_token_encrypted: string
  refresh_token_iv: string
  expires_at: string
}

type BrandVoiceRow = BrandVoice & {
  auto_post_enabled: boolean
}

type CalibrationExampleRow = {
  scenario_type: string
  review_sample: string
  ai_response: string
  decision: 'accepted' | 'edited'
  edited_text: string | null
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getOAuthTokens(locationId: string): Promise<OAuthTokenRow> {
  const { data, error } = await getSupabase()
    .from('oauth_tokens')
    .select('access_token_encrypted, access_token_iv, refresh_token_encrypted, refresh_token_iv, expires_at')
    .eq('location_id', locationId)
    .single()

  if (error || !data) throw new Error(`getOAuthTokens(${locationId}): ${error?.message ?? 'not found'}`)
  return data as OAuthTokenRow
}

async function getBrandVoice(locationId: string): Promise<BrandVoiceRow> {
  const { data, error } = await getSupabase()
    .from('brand_voices')
    .select('personality, avoid, signature_phrases, language, owner_description, auto_post_enabled')
    .eq('location_id', locationId)
    .single()

  if (error || !data) throw new Error(`getBrandVoice(${locationId}): ${error?.message ?? 'not found'}`)
  return data as BrandVoiceRow
}

async function getCalibrationExamples(locationId: string): Promise<CalibrationExample[]> {
  const { data, error } = await getSupabase()
    .from('calibration_examples')
    .select('scenario_type, review_sample, ai_response, decision, edited_text')
    .eq('location_id', locationId)
    .in('decision', ['accepted', 'edited'])

  if (error) throw new Error(`getCalibrationExamples(${locationId}): ${error.message}`)

  return (data as CalibrationExampleRow[]).map(row => ({
    scenario_type: row.scenario_type as CalibrationExample['scenario_type'],
    review_sample: row.review_sample,
    // Use the owner's edited version if available — that's the approved text
    ai_response: row.decision === 'edited' && row.edited_text ? row.edited_text : row.ai_response,
  }))
}

// Returns the text of the most recently posted response for duplicate detection.
async function getLastPostedText(locationId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('responses_posted')
    .select('text')
    .eq('location_id', locationId)
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.text ?? null
}

async function storeResponse(
  locationId: string,
  googleReviewId: string,
  text: string,
  status: 'posted' | 'failed' | 'blocked_pending_regen',
  failureReason: string | null,
  attempts: number,
): Promise<void> {
  const { error } = await getSupabase().from('responses_posted').upsert(
    {
      location_id: locationId,
      review_id: googleReviewId,
      text,
      posted_at: status === 'posted' ? new Date().toISOString() : null,
      status,
      failure_reason: failureReason,
      attempts,
    },
    { onConflict: 'location_id,review_id' },
  )

  if (error) {
    // Don't throw — a storage failure shouldn't unwind a successful post.
    // The response was already live on Google at this point.
    console.error(`storeResponse failed for ${googleReviewId}:`, error.message)
  }
}

// Check if we already have a response for this review (posted, failed, or blocked).
// Prevents double-processing if the cron fires twice or Vercel cold-starts overlap.
async function hasExistingResponse(locationId: string, googleReviewId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('responses_posted')
    .select('id')
    .eq('location_id', locationId)
    .eq('review_id', googleReviewId)
    .maybeSingle()

  return data !== null
}

// ─── Generation ──────────────────────────────────────────────────────────────

async function generate(
  brandVoice: BrandVoice,
  examples: CalibrationExample[],
  review: Review,
): Promise<string> {
  const prompt = buildGeneratePrompt(brandVoice, examples, review)

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  })

  const text = completion.choices[0]?.message.content?.trim() ?? ''
  if (!text) throw new Error('OpenAI returned an empty response')
  return text
}

// ─── Quality gate ────────────────────────────────────────────────────────────

type GateResult = { pass: true } | { pass: false; reason: string }

function checkHardRules(
  response: string,
  brandVoice: BrandVoice,
  lastPostedText: string | null,
): GateResult {
  if (response.length < 20) {
    return { pass: false, reason: `Response too short (${response.length} chars, minimum 20)` }
  }
  if (response.length > 300) {
    return { pass: false, reason: `Response too long (${response.length} chars, maximum 300)` }
  }

  const lower = response.toLowerCase()
  const avoidPhrase = brandVoice.avoid.toLowerCase()
  if (avoidPhrase && lower.includes(avoidPhrase)) {
    return { pass: false, reason: `Response contains forbidden phrase: "${brandVoice.avoid}"` }
  }

  if (lastPostedText && response === lastPostedText) {
    return { pass: false, reason: 'Response is identical to the last posted response for this location' }
  }

  return { pass: true }
}

async function checkWithLlm(
  response: string,
  brandVoice: BrandVoice,
  review: Review,
): Promise<GateResult> {
  const prompt = buildQualityCheckPrompt(brandVoice, response, review)

  let raw: string
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    })
    raw = completion.choices[0]?.message.content?.trim() ?? ''
  } catch (err) {
    // Fail safe: if the LLM call itself errors, block the response
    const msg = err instanceof Error ? err.message : String(err)
    return { pass: false, reason: `LLM quality check failed: ${msg}` }
  }

  try {
    const result = JSON.parse(raw) as QualityCheckResult
    return result.pass ? { pass: true } : { pass: false, reason: result.reason }
  } catch {
    // Fail safe: unparseable response means we can't confirm quality
    return { pass: false, reason: 'Quality check returned unparseable response' }
  }
}

async function runQualityGate(
  response: string,
  brandVoice: BrandVoice,
  review: Review,
  lastPostedText: string | null,
): Promise<GateResult> {
  // Hard rules are free and synchronous — check first
  const hardResult = checkHardRules(response, brandVoice, lastPostedText)
  if (!hardResult.pass) return hardResult

  // LLM self-check only runs if hard rules pass
  return checkWithLlm(response, brandVoice, review)
}

// ─── Post with retry ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Makes up to 3 attempts (2 retries) with 1s backoff between each.
// Throws the last error if all attempts fail.
async function postWithRetry(
  locationId: string,
  reviewId: string,
  replyText: string,
  accessToken: string,
): Promise<void> {
  const MAX_ATTEMPTS = 3
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await postReply(locationId, reviewId, replyText, accessToken)
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_ATTEMPTS) await sleep(1000)
    }
  }

  throw lastError
}

// ─── Per-review processing ───────────────────────────────────────────────────

// Returns the posted text on success, or null if the review was skipped/blocked/failed.
async function processOneReview(
  locationId: string,       // internal UUID — used for DB writes
  googleLocationId: string, // GBP resource path — used for API calls
  review: Review,
  brandVoice: BrandVoice,
  examples: CalibrationExample[],
  accessToken: string,
  lastPostedText: string | null,
): Promise<string | null> {
  // Generation errors (OpenAI down, empty response) are not retried here —
  // the review stays unanswered and will be picked up on the next cron run.
  let draft: string
  try {
    draft = await generate(brandVoice, examples, review)
  } catch (err) {
    console.error(`generate failed for review ${review.google_review_id}:`, err)
    return null
  }

  // First quality gate pass
  let gateResult = await runQualityGate(draft, brandVoice, review, lastPostedText)

  if (!gateResult.pass) {
    // Auto-regen once
    try {
      draft = await generate(brandVoice, examples, review)
    } catch (err) {
      console.error(`regen failed for review ${review.google_review_id}:`, err)
      return null
    }

    gateResult = await runQualityGate(draft, brandVoice, review, lastPostedText)

    if (!gateResult.pass) {
      await storeResponse(locationId, review.google_review_id, draft, 'blocked_pending_regen', gateResult.reason, 2)
      return null
    }
  }

  // Post with retry
  try {
    await postWithRetry(googleLocationId, review.google_review_id, draft, accessToken)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await storeResponse(locationId, review.google_review_id, draft, 'failed', reason, 3)

    // Fire-and-forget — alert failure should never block the cron loop
    sendFailureAlert(locationId, review.google_review_id, draft).catch(alertErr => {
      console.error(`sendFailureAlert failed for ${review.google_review_id}:`, alertErr)
    })

    return null
  }

  await storeResponse(locationId, review.google_review_id, draft, 'posted', null, 1)
  return draft
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Processes all unanswered reviews for a single location.
 * Called once per location per cron invocation.
 *
 * Does not throw — all per-review errors are caught and stored.
 * A thrown error here indicates a location-level failure (bad tokens, missing config).
 */
/**
 * Refreshes the access token with a database-level lock to prevent concurrent
 * refreshes from cron and calibration (which would cause invalid_grant errors
 * because Google invalidates the old refresh token on use).
 *
 * Uses `refreshing_since` as a simple optimistic lock:
 * 1. Atomically set refreshing_since WHERE it's null (or stale >60s)
 * 2. If the update matched 0 rows, another process is refreshing — wait and re-read
 * 3. If matched, we hold the lock — refresh, update tokens, clear the lock
 */
async function refreshAccessTokenWithLock(locationId: string): Promise<string> {
  const LOCK_TIMEOUT_MS = 60_000
  const now = new Date()

  // Try to acquire the lock: set refreshing_since only if it's null or stale
  const { data: locked, error: lockErr } = await getSupabase()
    .from('oauth_tokens')
    .update({ refreshing_since: now.toISOString() })
    .eq('location_id', locationId)
    .or(`refreshing_since.is.null,refreshing_since.lt.${new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString()}`)
    .select('refresh_token_encrypted, refresh_token_iv')
    .maybeSingle()

  if (lockErr) throw new Error(`refreshAccessTokenWithLock: lock failed for ${locationId}: ${lockErr.message}`)

  if (!locked) {
    // Another process is actively refreshing. Wait briefly then re-read the fresh token.
    await sleep(2000)
    const freshRow = await getOAuthTokens(locationId)
    return decrypt(freshRow.access_token_encrypted, freshRow.access_token_iv)
  }

  // We hold the lock. Refresh the token.
  try {
    const refreshToken = decrypt(locked.refresh_token_encrypted, locked.refresh_token_iv)
    const refreshed = await refreshOAuthToken(refreshToken)
    const { ciphertext, iv } = encrypt(refreshed.accessToken)

    const { error: updateErr } = await getSupabase()
      .from('oauth_tokens')
      .update({
        access_token_encrypted: ciphertext,
        access_token_iv: iv,
        expires_at: refreshed.expiresAt.toISOString(),
        refreshing_since: null, // release the lock
      })
      .eq('location_id', locationId)

    if (updateErr) throw new Error(`token refresh DB update failed: ${updateErr.message}`)
    return refreshed.accessToken
  } catch (err) {
    // Release the lock on failure so the next caller can retry
    await getSupabase()
      .from('oauth_tokens')
      .update({ refreshing_since: null })
      .eq('location_id', locationId)
    throw err
  }
}

export async function processLocation(locationId: string): Promise<void> {
  // 1. Fetch and decrypt tokens
  const tokenRow = await getOAuthTokens(locationId)

  // 2. Refresh access token if it expires within 5 minutes
  let accessToken: string
  const expiresAt = new Date(tokenRow.expires_at)
  const fiveMinutes = 5 * 60 * 1000

  if (expiresAt.getTime() - Date.now() <= fiveMinutes) {
    accessToken = await refreshAccessTokenWithLock(locationId)
  } else {
    accessToken = decrypt(tokenRow.access_token_encrypted, tokenRow.access_token_iv)
  }

  // 3. Look up GBP resource path (needed for GBP API calls — different from internal UUID)
  const { data: locRow, error: locErr } = await getSupabase()
    .from('locations')
    .select('google_location_id')
    .eq('id', locationId)
    .single()

  if (locErr || !locRow) throw new Error(`processLocation: location row not found for ${locationId}`)
  const googleLocationId = locRow.google_location_id as string
  if (!googleLocationId) throw new Error(`processLocation: google_location_id is empty for ${locationId}`)

  // 4. Fetch unanswered reviews
  const reviews = await fetchReviews(googleLocationId, accessToken)
  if (reviews.length === 0) return

  // 5. Load brand voice — bail if auto-post is disabled
  const brandVoice = await getBrandVoice(locationId)
  if (!brandVoice.auto_post_enabled) return

  // 6. Load accepted calibration examples (few-shot context for generation)
  const examples = await getCalibrationExamples(locationId)

  // 7. Track last posted text to prevent duplicate responses within this run
  let lastPostedText = await getLastPostedText(locationId)

  // 8. Process each review sequentially — parallel would risk duplicate detection gaps
  for (const review of reviews) {
    // Idempotency: skip reviews we've already processed (covers cron overlap, cold-start retries)
    if (await hasExistingResponse(locationId, review.google_review_id)) continue

    const posted = await processOneReview(
      locationId,
      googleLocationId,
      review,
      brandVoice,
      examples,
      accessToken,
      lastPostedText,
    )
    if (posted) lastPostedText = posted
  }
}
