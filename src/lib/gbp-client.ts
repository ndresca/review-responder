import type { Review } from './types'

const GBP_BASE = 'https://mybusiness.googleapis.com/v4'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// GBP returns star ratings as strings
const STAR_RATING: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

// ─── Internal API shapes ────────────────────────────────────────────────────

type GbpReview = {
  name: string             // full resource name: "accounts/.../locations/.../reviews/..."
  reviewId: string
  reviewer: { displayName: string }
  starRating: string       // "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE"
  comment?: string         // absent for rating-only reviews
  createTime: string
  reviewReply?: { comment: string; updateTime: string }
}

type GbpReviewsPage = {
  reviews?: GbpReview[]
  nextPageToken?: string
}

// Google wraps API errors as { "error": { code, message, status } }
type GbpErrorBody = {
  error: { code: number; message: string; status: string }
}

// OAuth token errors use a flatter shape
type OAuthErrorBody = {
  error: string
  error_description?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapReview(r: GbpReview): Review {
  return {
    google_review_id: r.reviewId,
    reviewer_name: r.reviewer.displayName,
    rating: STAR_RATING[r.starRating] ?? 0,
    text: r.comment ?? '',
    created_at: r.createTime,
  }
}

// Reads Google's error body and throws with a descriptive message.
// Consumes the response body — call only after confirming !res.ok.
async function throwGbpError(res: Response, context: string): Promise<never> {
  let message = `${context}: HTTP ${res.status}`
  try {
    const body = (await res.json()) as GbpErrorBody
    if (body.error?.message) {
      message = `${context}: ${body.error.message} (${res.status} ${body.error.status})`
    }
  } catch {
    // body wasn't JSON — the status-only message is fine
  }
  throw new Error(message)
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetches all reviews for a location that have no existing reply.
 * Follows pagination automatically.
 *
 * @param locationId Full GBP resource path, e.g. "accounts/123/locations/456"
 * @param accessToken Short-lived OAuth access token with business.manage scope
 */
export async function fetchReviews(
  locationId: string,
  accessToken: string,
): Promise<Review[]> {
  const unanswered: Review[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${GBP_BASE}/${locationId}/reviews`)
    url.searchParams.set('pageSize', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) await throwGbpError(res, 'fetchReviews')

    const page = (await res.json()) as GbpReviewsPage

    for (const r of page.reviews ?? []) {
      if (!r.reviewReply) {
        unanswered.push(mapReview(r))
      }
    }

    pageToken = page.nextPageToken
  } while (pageToken)

  return unanswered
}

/**
 * Posts a reply to a specific review.
 * Throws a descriptive error if Google rejects the request.
 *
 * @param locationId Full GBP resource path, e.g. "accounts/123/locations/456"
 * @param reviewId   The reviewId field from the GBP reviews response
 * @param replyText  Plain text of the response to post
 * @param accessToken Short-lived OAuth access token with business.manage scope
 */
export async function postReply(
  locationId: string,
  reviewId: string,
  replyText: string,
  accessToken: string,
): Promise<void> {
  const url = `${GBP_BASE}/${locationId}/reviews/${reviewId}/reply`

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment: replyText }),
  })

  if (!res.ok) await throwGbpError(res, 'postReply')
}

/**
 * Exchanges a refresh token for a new short-lived access token.
 * Throws if GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET are missing,
 * or if Google rejects the token exchange.
 *
 * @param refreshToken The stored (decrypted) OAuth refresh token
 */
export async function refreshOAuthToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set')
  if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET is not set')

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    let message = `refreshOAuthToken: HTTP ${res.status}`
    try {
      const body = (await res.json()) as OAuthErrorBody
      message = `refreshOAuthToken: ${body.error_description ?? body.error} (${res.status})`
    } catch {
      // body wasn't JSON
    }
    throw new Error(message)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return { accessToken: data.access_token, expiresAt }
}
