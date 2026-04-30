import { createClient } from '@supabase/supabase-js'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

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
