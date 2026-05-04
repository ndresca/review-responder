import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import type { SupabaseClient, User } from '@supabase/supabase-js'

// Shared session validation. Reads the Supabase auth JWT from the sb-* auth
// cookies set by the OAuth callback (src/app/api/auth/google/callback/route.ts)
// after JWT minting. Supabase's SSR client validates the JWT signature and
// expiry server-side via auth.getUser(). The JWT contains sub=ownerId, and
// it rotates: the callback mints a fresh 1h-expiry token on every successful
// OAuth round-trip.
//
// Returns { ownerId } on success, null otherwise.
//
// Migration note: getValidSession previously read autoplier_session, a cookie
// holding the raw owner UUID. That cookie was a stable, non-rotating session
// identifier — leak-once-and-it's-yours-for-30-days. Now removed in favor of
// the rotating sb-* JWT.
//
// Callers consume it like:
//   const session = await getValidSession(await cookies())
//   if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//   const ownerId = session.ownerId

type CookieStoreLike = Pick<ReadonlyRequestCookies, 'get' | 'getAll'>

export type ValidSession = { ownerId: string }

export async function getValidSession(cookieStore: CookieStoreLike): Promise<ValidSession | null> {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('getValidSession: SUPABASE_URL or SUPABASE_ANON_KEY missing')
    return null
  }

  // createServerClient + auth.getUser() validates the JWT against
  // SUPABASE_JWT_SECRET (configured on the auth server) and confirms the
  // user still exists. Expired or tampered tokens return error/null user.
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      // No-op — we don't refresh in this code path. The OAuth callback re-mints
      // on next auth round-trip.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setAll(_cookies: { name: string; value: string; options: CookieOptions }[]) {},
    },
  })

  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return { ownerId: user.id }
  } catch (err) {
    console.error('getValidSession: auth.getUser threw:', err)
    return null
  }
}

/**
 * Returns a user-scoped Supabase client backed by the request's sb-* cookies
 * (set by the OAuth callback after JWT minting). Queries through this client
 * have auth.uid() populated, so RLS policies "auth.uid() = owner_id" enforce
 * row-level access automatically — even if a route forgets the .eq filter,
 * the policy catches it.
 *
 * Read routes (dashboard/load, history/load, settings/load) use this in
 * place of the service-role client. Write routes still use service-role
 * because they need to bypass RLS for cross-user operations (settings/save
 * verifying location ownership before writing, delete-account cascading
 * across owner_id, etc.).
 *
 * Returns null when the request lacks valid sb-* cookies — auth.getUser()
 * returns no user. Callers should treat that as 401.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAuthedSupabase(): Promise<{ user: User; supabase: SupabaseClient<any> } | null> {
  const cookieStore = await cookies()
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('getAuthedSupabase: SUPABASE_URL or SUPABASE_ANON_KEY missing')
    return null
  }

  // setAll is a no-op on read-only contexts — Supabase SSR may try to refresh
  // the session and write new cookies, but for short-lived JWT sessions
  // (1h expiry, no refresh token rotation) we just want to read state.
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setAll(_cookies: { name: string; value: string; options: CookieOptions }[]) {},
    },
  })

  let user
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (err) {
    // Bug B diagnostic — the user reports "Refresh token is not valid"
    // surfacing from inside the Supabase SDK on session refresh attempts.
    // Capturing the actual exception message + name to confirm whether
    // this throw originates from getUser() itself, and whether SSR's
    // implicit refreshSession is the culprit. Removed once root-caused.
    // eslint-disable-next-line no-console
    console.log('[BUG_B_DIAGNOSTIC] getAuthedSupabase exception', {
      timestamp: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : 'unknown',
    })
    throw err
  }
  if (!user) return null
  return { user, supabase }
}
