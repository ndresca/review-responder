import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'openid',
  'email',
  'profile',
].join(' ')

const STATE_COOKIE = 'oauth_state'
const STATE_MAX_AGE_SECONDS = 600 // 10 minutes

export async function GET(request: Request): Promise<NextResponse> {
  const appOrigin = new URL(request.url).origin

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    console.error('google oauth: missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI')
    return NextResponse.redirect(`${appOrigin}/onboarding?error=config`)
  }

  const nonce = randomBytes(16).toString('hex')

  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', nonce)

  const response = NextResponse.redirect(authUrl.toString())

  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE_SECONDS,
    path: '/api/auth/google',
  })

  return response
}
