import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'
import { issueRefreshToken, mintSupabaseSession } from '@/lib/session-mint'

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const GBP_BASE = 'https://mybusiness.googleapis.com/v4'
const STATE_COOKIE = 'oauth_state'

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Simple in-memory sliding window per IP. Limits to 5 callback attempts per minute.
// Sufficient for serverless: each cold start gets a fresh map, so worst case is
// 5 * number_of_instances per minute — still far better than unlimited.

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

const rateLimitMap = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) return true
  recent.push(now)
  rateLimitMap.set(ip, recent)
  return false
}

// ─── Supabase (service role — needed for oauth_tokens which blocks all client access) ──

function buildSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── GBP API shapes ──────────────────────────────────────────────────────────

type GbpAccount = {
  name: string        // "accounts/1234567890"
  accountName: string
}

type GbpAccountsPage = {
  accounts?: GbpAccount[]
  nextPageToken?: string
}

type GbpLocation = {
  name: string        // "accounts/1234567890/locations/9876543210"
  locationName: string
}

type GbpLocationsPage = {
  locations?: GbpLocation[]
  nextPageToken?: string
}

type GoogleUserInfo = {
  sub: string           // Google user ID
  email: string
  name?: string
  picture?: string
}

type GbpErrorBody = {
  error: { code: number; message: string; status: string }
}

// ─── GBP helpers ─────────────────────────────────────────────────────────────

async function throwGbpError(res: Response, context: string): Promise<never> {
  let message = `${context}: HTTP ${res.status}`
  try {
    const body = (await res.json()) as GbpErrorBody
    if (body.error?.message) {
      message = `${context}: ${body.error.message} (${res.status} ${body.error.status})`
    }
  } catch { /* body wasn't JSON */ }
  throw new Error(message)
}

async function listAccounts(accessToken: string): Promise<GbpAccount[]> {
  const accounts: GbpAccount[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${GBP_BASE}/accounts`)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) await throwGbpError(res, 'listAccounts')

    const page = (await res.json()) as GbpAccountsPage
    accounts.push(...(page.accounts ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)

  return accounts
}

async function listLocations(
  accountName: string,
  accessToken: string,
): Promise<GbpLocation[]> {
  const locations: GbpLocation[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${GBP_BASE}/${accountName}/locations`)
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) await throwGbpError(res, 'listLocations')

    const page = (await res.json()) as GbpLocationsPage
    locations.push(...(page.locations ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)

  return locations
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

// Upserts a location row and returns its internal UUID.
async function upsertLocation(
  supabase: SupabaseClient<any>,
  googleLocationId: string,
  name: string,
  ownerId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('locations')
    .upsert(
      { google_location_id: googleLocationId, name, owner_id: ownerId },
      { onConflict: 'google_location_id' },
    )
    .select('id')
    .single()

  if (error || !data) throw new Error(`upsertLocation(${googleLocationId}): ${error?.message ?? 'no data'}`)
  return data.id as string
}

// Creates a brand_voice row only if one does not exist yet for this location.
// brand_voices has no unique constraint on location_id, so we check first.
async function ensureBrandVoice(
  supabase: SupabaseClient<any>,
  locationId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('brand_voices')
    .select('id')
    .eq('location_id', locationId)
    .maybeSingle()

  if (existing) return

  const { error } = await supabase.from('brand_voices').insert({
    location_id: locationId,
    personality: '',         // set during calibration onboarding
    avoid: '',
    signature_phrases: [],
    language: 'en',
    auto_post_enabled: false,
    calibrated_at: null,
    calibration_examples_accepted: 0,
  })

  if (error) throw new Error(`ensureBrandVoice(${locationId}): ${error.message}`)
}

// Upserts (or replaces) the encrypted OAuth tokens for a location.
async function upsertOAuthTokens(
  supabase: SupabaseClient<any>,
  locationId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
): Promise<void> {
  const { ciphertext: accessEnc, iv: accessIv } = encrypt(accessToken)
  const { ciphertext: refreshEnc, iv: refreshIv } = encrypt(refreshToken)

  const { error } = await supabase
    .from('oauth_tokens')
    .upsert(
      {
        location_id: locationId,
        access_token_encrypted: accessEnc,
        access_token_iv: accessIv,
        refresh_token_encrypted: refreshEnc,
        refresh_token_iv: refreshIv,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'location_id' },
    )

  if (error) throw new Error(`upsertOAuthTokens(${locationId}): ${error.message}`)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const appOrigin = new URL(request.url).origin
  const searchParams = new URL(request.url).searchParams

  const redirectError = (reason: string) => {
    console.error('OAuth callback error:', reason)
    return NextResponse.redirect(`${appOrigin}/error?reason=${encodeURIComponent(reason)}`)
  }

  // ── 0. Rate limit ──────────────────────────────────────────────────────────

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  if (isRateLimited(clientIp)) {
    return redirectError('rate_limited')
  }

  // ── 1. Read and validate state cookie ──────────────────────────────────────

  const cookieStore = await cookies()
  const storedNonce = cookieStore.get(STATE_COOKIE)?.value

  if (!storedNonce) return redirectError('missing_state')

  const stateParam = searchParams.get('state')
  if (!stateParam || stateParam !== storedNonce) return redirectError('state_mismatch')

  const errorParam = searchParams.get('error')
  if (errorParam) return redirectError(`google_${errorParam}`)

  const code = searchParams.get('code')
  if (!code) return redirectError('missing_code')

  // ── 2. Exchange code for tokens ────────────────────────────────────────────

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectError('config')
  }

  let accessToken: string
  let refreshToken: string
  let expiresAt: Date

  try {
    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('token exchange failed:', tokenRes.status, body)
      return redirectError('token_exchange')
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    if (!tokenData.access_token) return redirectError('no_access_token')
    // refresh_token is absent if the user previously granted access and we didn't pass prompt=consent
    if (!tokenData.refresh_token) return redirectError('no_refresh_token')

    accessToken = tokenData.access_token
    refreshToken = tokenData.refresh_token
    if (tokenData.expires_in == null) console.warn('Google token response missing expires_in; defaulting to 3600s')
    expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000)
  } catch (err) {
    console.error('token exchange error:', err)
    return redirectError('token_exchange')
  }

  // ── 2b. Fetch Google user profile ──────────────────────────────────────────

  let googleProfile: GoogleUserInfo
  try {
    const userInfoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!userInfoRes.ok) {
      console.error('userinfo fetch failed:', userInfoRes.status)
      return redirectError('userinfo_fetch')
    }
    googleProfile = (await userInfoRes.json()) as GoogleUserInfo
  } catch (err) {
    console.error('userinfo error:', err)
    return redirectError('userinfo_fetch')
  }

  // ── 2c. Create or find Supabase user from Google profile ───────────────────

  const supabase = buildSupabase()
  let ownerId: string

  try {
    // Try to find existing user by email
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === googleProfile.email)

    if (existingUser) {
      ownerId = existingUser.id
    } else {
      // Create a new user with their Google profile
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: googleProfile.email,
        email_confirm: true,
        user_metadata: {
          google_id: googleProfile.sub,
          google_email: googleProfile.email,
          google_name: googleProfile.name ?? null,
          google_picture: googleProfile.picture ?? null,
        },
      })
      if (createErr || !newUser.user) {
        console.error('user creation failed:', createErr)
        return redirectError('user_creation')
      }
      ownerId = newUser.user.id
    }
  } catch (err) {
    console.error('user lookup/creation error:', err)
    return redirectError('user_creation')
  }

  // ── 3. Fetch GBP accounts and locations (best-effort) ───────────────────────
  // GBP API access may not be approved yet — don't block onboarding if it fails.
  // Locations will be synced separately once access is granted.

  // Track the first internal location UUID so we can pass it back to the
  // onboarding page. The page's calibration POST needs a real locationId;
  // multi-location accounts pick the first one for now (location switcher
  // is a separate feature).
  let firstLocationId: string | null = null

  try {
    const accounts = await listAccounts(accessToken)

    if (accounts.length > 0) {
      const locationLists = await Promise.all(
        accounts.map(account => listLocations(account.name, accessToken)),
      )
      const allLocations = locationLists.flat()

      if (allLocations.length > 0) {
        for (const gbpLocation of allLocations) {
          const locationId = await upsertLocation(
            supabase,
            gbpLocation.name,
            gbpLocation.locationName,
            ownerId,
          )
          if (!firstLocationId) firstLocationId = locationId
          await Promise.all([
            ensureBrandVoice(supabase, locationId),
            upsertOAuthTokens(supabase, locationId, accessToken, refreshToken, expiresAt),
          ])
        }
      } else {
        console.warn('GBP: accounts found but no locations — skipping location sync')
      }
    } else {
      console.warn('GBP: no accounts found — skipping location sync')
    }
  } catch (err) {
    console.warn('GBP fetch/sync skipped — API may not be approved yet:', err)
  }

  // Always-create stub fallback. If GBP returned no accounts/locations, or
  // GBP API access isn't approved yet for this Google account (the catch
  // above), firstLocationId stays null. Without this, the redirect URL
  // omits ?locationId, the onboarding page mounts with a falsy locationId,
  // handleStep2Continue's `if (locationId)` guard silently skips the save,
  // and the user's step 2 typing never persists across hard reloads.
  //
  // The stub is keyed on a synthetic google_location_id ("pending:${ownerId}")
  // so the schema's NOT NULL UNIQUE constraint is satisfied, the row is
  // idempotent across OAuth re-runs, AND a future GBP-approval sync can
  // identify and replace pending:* stubs with real GBP resource paths.
  if (!firstLocationId) {
    const stubGoogleId = `pending:${ownerId}`
    const { data: stubLocation, error: stubErr } = await supabase
      .from('locations')
      .upsert(
        { owner_id: ownerId, name: '', google_location_id: stubGoogleId },
        { onConflict: 'google_location_id' },
      )
      .select('id')
      .single()

    if (stubErr || !stubLocation) {
      console.error('OAuth callback: stub location creation failed:', stubErr)
      return redirectError('user_creation')
    }
    firstLocationId = stubLocation.id as string

    // Reuse the existing helper so this fallback can't drift from the GBP
    // path. Best-effort: a brand_voices INSERT failure here just means
    // step 2's UPDATE finds no row and 500s, which is at least a visible
    // failure mode rather than silent data loss.
    try {
      await ensureBrandVoice(supabase, firstLocationId)
    } catch (err) {
      console.error('OAuth callback: stub brand_voices creation failed:', err)
    }

    // Persist Google OAuth tokens for stub-locations users (PR #58 stub pattern + calibrate fix).
    // The user successfully OAuth'd; their tokens are valid Google credentials. Persisting here
    // means downstream routes (calibrate, regenerateExample, auto-post cron) can resolve access
    // tokens normally. GBP API calls will 403 until approval lands — handled by existing
    // best-effort catches.
    try {
      await upsertOAuthTokens(supabase, firstLocationId, accessToken, refreshToken, expiresAt)
    } catch (err) {
      console.error('OAuth callback: stub oauth_tokens upsert failed:', err)
    }
  }


  // ── 5. Update Google profile on user metadata (covers existing users) ─────

  await supabase.auth.admin.updateUserById(ownerId, {
    user_metadata: {
      google_id: googleProfile.sub,
      google_email: googleProfile.email,
      google_name: googleProfile.name ?? null,
      google_picture: googleProfile.picture ?? null,
    },
  })

  // ── 6. Set session cookie, clear state cookie, redirect ─────────────────

  // Pass the first location's internal UUID through so the onboarding page
  // can fire the calibration POST against a real location. If GBP failed
  // (no accounts, API not approved, etc.) we omit the param and the page
  // surfaces a clear error instead of trying to POST against null.
  const redirectUrl = new URL(`${appOrigin}/onboarding`)
  redirectUrl.searchParams.set('step', '2')
  if (firstLocationId) redirectUrl.searchParams.set('locationId', firstLocationId)

  const response = NextResponse.redirect(redirectUrl.toString())

  // ── 6a. Mint a Supabase-compatible JWT + issue our own refresh token ─────
  // mintSupabaseSession writes sb-<project-ref>-auth-token cookies (1h
  // expiry) so RLS-protected reads via @supabase/ssr see auth.uid()=ownerId.
  // issueRefreshToken inserts a session_tokens row (SHA-256 hashed) and
  // sets the autoplier_refresh cookie (30d). When the 1h JWT expires,
  // /api/auth/refresh trades the refresh cookie for a fresh JWT — no
  // re-OAuth required.
  try {
    await mintSupabaseSession(ownerId, cookieStore, response)
    await issueRefreshToken(ownerId, response)
  } catch (err) {
    console.error('OAuth callback: session minting failed:', err)
    return redirectError('config')
  }

  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth/google',
  })

  return response
}
