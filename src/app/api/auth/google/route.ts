import { createServerClient } from '@supabase/ssr'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'openid',
  'email',
  'profile',
].join(' ')

// State cookie stores "{nonce}:{userId}" so we know who to associate
// GBP locations with when Google redirects back.
const STATE_COOKIE = 'oauth_state'
const STATE_MAX_AGE_SECONDS = 600 // 10 minutes

export async function GET(request: Request): Promise<NextResponse> {
  const appOrigin = new URL(request.url).origin

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

  if (!clientId || !redirectUri || !supabaseUrl || !supabaseAnonKey) {
    console.error('google oauth: missing required env vars')
    return NextResponse.redirect(`${appOrigin}/error?reason=config`)
  }

  // Read the authenticated Supabase user from the session cookie.
  // @supabase/ssr wires next/headers cookies into the client automatically.
  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      // Read-only — we're not writing Supabase session cookies here
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appOrigin}/login`)
  }

  const nonce = randomBytes(16).toString('hex')

  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('access_type', 'offline')   // required for refresh token
  authUrl.searchParams.set('prompt', 'consent')         // force refresh token even if previously granted
  authUrl.searchParams.set('state', nonce)

  const response = NextResponse.redirect(authUrl.toString())

  // httpOnly prevents JS from reading this; sameSite=lax is safe for redirect flows
  response.cookies.set(STATE_COOKIE, `${nonce}:${user.id}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE_SECONDS,
    path: '/api/auth/google',
  })

  return response
}
