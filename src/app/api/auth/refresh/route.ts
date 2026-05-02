import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  findValidRefreshToken,
  mintSupabaseSession,
  userExists,
} from '@/lib/session-mint'

// /api/auth/refresh
//
// Trades the autoplier_refresh cookie for a fresh sb-* JWT. Two callers:
//
// 1) POST — client-side refresh (e.g. before a fetch retry). Returns
//    { success: true } 200 with new sb-* cookies, or { error } 401 with
//    cookies cleared on failure.
//
// 2) GET ?next=<path> — middleware-redirect flow. On success redirects
//    to <next> with new sb-* cookies on the response. On failure
//    redirects to /onboarding (and clears the refresh cookie).
//
// Both paths share doRefresh which does the actual work; the methods
// just wrap it in JSON vs redirect responses.

type RefreshOutcome =
  | { ok: true }
  | { ok: false; reason: 'no_cookie' | 'invalid' | 'expired' | 'user_gone' | 'mint_failed' }

async function doRefresh(response: NextResponse): Promise<RefreshOutcome> {
  const cookieStore = await cookies()
  const rawToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value
  if (!rawToken) return { ok: false, reason: 'no_cookie' }

  const session = await findValidRefreshToken(rawToken)
  if (!session) {
    // Could be unknown, revoked, or expired — they all collapse to "this
    // token can't be used". Clear the cookie so future requests skip the
    // useless DB lookup.
    clearRefreshCookie(response)
    return { ok: false, reason: 'invalid' }
  }

  // The session_tokens row could outlive the auth.users row in edge cases
  // (e.g. admin deleted user via SQL without going through delete-account).
  // Verify before minting.
  if (!(await userExists(session.ownerId))) {
    clearRefreshCookie(response)
    return { ok: false, reason: 'user_gone' }
  }

  try {
    await mintSupabaseSession(session.ownerId, cookieStore, response)
  } catch (err) {
    console.error('refresh: mintSupabaseSession threw:', err)
    return { ok: false, reason: 'mint_failed' }
  }

  return { ok: true }
}

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true })
  const result = await doRefresh(response)
  if (result.ok) return response

  // Replace the body with a 401 while preserving any clearRefreshCookie
  // that doRefresh wrote onto `response`.
  const failure = NextResponse.json({ error: 'Unauthorized', reason: result.reason }, { status: 401 })
  for (const c of response.cookies.getAll()) {
    failure.cookies.set(c.name, c.value, c)
  }
  return failure
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const nextParam = url.searchParams.get('next') ?? '/dashboard'
  // Only allow same-origin paths — block open-redirect via ?next=https://evil.com
  const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

  const response = NextResponse.redirect(new URL(safeNext, request.url))
  const result = await doRefresh(response)
  if (result.ok) return response

  // Refresh failed — send the user back to /onboarding to re-OAuth, while
  // preserving any cookie clears doRefresh wrote.
  const failure = NextResponse.redirect(new URL('/onboarding', request.url))
  for (const c of response.cookies.getAll()) {
    failure.cookies.set(c.name, c.value, c)
  }
  return failure
}
