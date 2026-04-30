import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { randomBytes, createHash } from 'crypto'
import { cookies } from 'next/headers'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import type { NextResponse } from 'next/server'

// Shared session-minting helpers used by /api/auth/google/callback and
// /api/auth/refresh. Extracted so the OAuth callback and the refresh
// endpoint can't drift apart on cookie attributes, JWT claims, or expiry.

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 // 1 hour, matches Supabase default
export const REFRESH_COOKIE_NAME = 'autoplier_refresh'
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

type CookieStoreLike = Pick<ReadonlyRequestCookies, 'getAll'>

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Hash a raw refresh token for DB storage. SHA-256 is fine here — the
 * input has 256 bits of entropy from randomBytes, no rainbow-table risk.
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Mint a Supabase-compatible access JWT for the given user and write the
 * sb-* auth cookies onto `response`. Mirrors the original OAuth callback
 * flow but without the legacy autoplier_session cookie.
 *
 * Throws on misconfiguration (missing env vars). Caller should redirect
 * to the error page on failure.
 */
export async function mintSupabaseSession(
  ownerId: string,
  cookieStore: CookieStoreLike,
  response: NextResponse,
): Promise<void> {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  if (!jwtSecret || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_JWT_SECRET / SUPABASE_URL / SUPABASE_ANON_KEY missing — cannot mint session')
  }

  const secret = new TextEncoder().encode(jwtSecret)
  const now = Math.floor(Date.now() / 1000)
  const accessToken = await new SignJWT({
    sub: ownerId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret)

  // Write sb-* cookies onto the outgoing response. setSession internally
  // calls our setAll with the sb-<project-ref>-auth-token cookies.
  const sbClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const c of cookiesToSet) {
          response.cookies.set(c.name, c.value, c.options)
        }
      },
    },
  })

  await sbClient.auth.setSession({
    access_token: accessToken,
    // refresh_token here is a Supabase concept (used by the SDK to silently
    // refresh on expiry). Our refresh flow lives at /api/auth/refresh and
    // uses our own refresh cookie — passing the same JWT keeps the SDK
    // happy even though we never actually rely on it for refresh.
    refresh_token: accessToken,
  })
}

/**
 * Issue a new opaque refresh token for the given owner: generate 32 bytes
 * of entropy, store its SHA-256 hash in session_tokens with a 30-day
 * expiry, and write the raw token to the autoplier_refresh cookie on
 * `response`.
 *
 * Returns the row id (useful for tests / observability).
 */
export async function issueRefreshToken(
  ownerId: string,
  response: NextResponse,
): Promise<string> {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashRefreshToken(rawToken)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

  const supabase = buildServiceSupabase()
  const { data, error } = await supabase
    .from('session_tokens')
    .insert({
      owner_id: ownerId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    } as never)
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`issueRefreshToken: insert failed: ${error?.message ?? 'no row returned'}`)
  }

  response.cookies.set(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    path: '/',
  })

  return (data as { id: string }).id
}

/**
 * Look up a refresh token by its raw cookie value. Returns the matching
 * session_tokens row (and its owner_id) if the token is valid, not
 * revoked, and not expired. Returns null otherwise — caller treats that
 * as 401.
 */
export async function findValidRefreshToken(rawToken: string): Promise<{ id: string; ownerId: string } | null> {
  if (!rawToken) return null
  const tokenHash = hashRefreshToken(rawToken)
  const supabase = buildServiceSupabase()
  const { data, error } = await supabase
    .from('session_tokens')
    .select('id, owner_id, expires_at, revoked')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) {
    console.error('findValidRefreshToken: lookup failed:', error.message)
    return null
  }
  if (!data) return null

  const row = data as { id: string; owner_id: string; expires_at: string; revoked: boolean }
  if (row.revoked) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) return null

  return { id: row.id, ownerId: row.owner_id }
}

/**
 * Verify the user behind a refresh token still exists in auth.users.
 * Defends against the case where an admin deleted the account but the
 * cookie/row haven't been revoked yet.
 */
export async function userExists(ownerId: string): Promise<boolean> {
  const supabase = buildServiceSupabase()
  try {
    const { data, error } = await supabase.auth.admin.getUserById(ownerId)
    return !error && !!data?.user
  } catch (err) {
    console.error('userExists: getUserById threw:', err)
    return false
  }
}

/**
 * Revoke a refresh token by raw cookie value. Idempotent — safe to call
 * even if the token is already revoked or never existed.
 */
export async function revokeRefreshToken(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return
  const tokenHash = hashRefreshToken(rawToken)
  const supabase = buildServiceSupabase()
  await supabase
    .from('session_tokens')
    .update({ revoked: true } as never)
    .eq('token_hash', tokenHash)
}

/**
 * Revoke ALL refresh tokens for an owner. Used on account deletion so
 * even un-cleared cookies on other devices stop working immediately.
 */
export async function revokeAllRefreshTokensForOwner(ownerId: string): Promise<void> {
  const supabase = buildServiceSupabase()
  await supabase
    .from('session_tokens')
    .update({ revoked: true } as never)
    .eq('owner_id', ownerId)
}

/**
 * Clear the refresh cookie on `response`. Pair with revokeRefreshToken
 * for full logout.
 */
export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })
}

/**
 * Resolve the cookieStore for the current request. Convenience wrapper
 * around next/headers cookies() for routes that just need to pass it
 * through to mintSupabaseSession.
 */
export async function getRequestCookieStore() {
  return cookies()
}
