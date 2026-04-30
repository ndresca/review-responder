import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import type { SupabaseClient, User } from '@supabase/supabase-js'

// Shared session validation. The autoplier_session cookie holds a raw owner
// UUID set by src/app/api/auth/google/callback/route.ts after a successful
// OAuth round-trip. Every protected API route used to trust this value
// directly — meaning any non-empty cookie passed.
//
// getValidSession() upgrades that to a real check: cookie present, value is
// a UUID, and the user actually exists in auth.users (i.e. the row hasn't
// been deleted). Returns { ownerId } on success, null otherwise.
//
// Callers consume it like:
//   const session = await getValidSession(await cookies())
//   if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//   const ownerId = session.ownerId

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Loose cookie-store type — accepts both the readonly `cookies()` return
// from next/headers and the read-write variant on responses. We only need
// .get(name) which is on both.
type CookieStoreLike = Pick<ReadonlyRequestCookies, 'get'>

export type ValidSession = { ownerId: string }

export async function getValidSession(cookieStore: CookieStoreLike): Promise<ValidSession | null> {
  const raw = cookieStore.get('autoplier_session')?.value
  if (!raw) return null

  // Cheap shape check — bail before hitting the DB on obviously-bogus values.
  // Future cookie format changes (signed tokens, JWTs) would replace this.
  if (!UUID_REGEX.test(raw)) return null

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    // Misconfigured environment — fail closed.
    console.error('getValidSession: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    return null
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Verify the user still exists. auth.admin.getUserById returns an error
  // for missing/deleted users — we treat any non-success as invalid session.
  try {
    const { data, error } = await supabase.auth.admin.getUserById(raw)
    if (error || !data?.user) return null
    return { ownerId: data.user.id }
  } catch (err) {
    console.error('getValidSession: auth.admin.getUserById threw:', err)
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { user, supabase }
}
