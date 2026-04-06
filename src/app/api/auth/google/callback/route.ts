import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
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

  const redirectError = (reason: string) =>
    NextResponse.redirect(`${appOrigin}/error?reason=${encodeURIComponent(reason)}`)

  // ── 0. Rate limit ──────────────────────────────────────────────────────────

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  if (isRateLimited(clientIp)) {
    return redirectError('rate_limited')
  }

  // ── 1. Read and validate state cookie ──────────────────────────────────────

  const cookieStore = await cookies()
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value

  if (!stateCookie) return redirectError('missing_state')

  const [storedNonce, ownerId] = stateCookie.split(':')
  if (!storedNonce || !ownerId) return redirectError('malformed_state')

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

  // ── 3. Fetch GBP accounts and locations ────────────────────────────────────

  let allLocations: GbpLocation[]

  try {
    const accounts = await listAccounts(accessToken)
    if (accounts.length === 0) return redirectError('no_gbp_accounts')

    const locationLists = await Promise.all(
      accounts.map(account => listLocations(account.name, accessToken)),
    )
    allLocations = locationLists.flat()
  } catch (err) {
    console.error('GBP fetch error:', err)
    return redirectError('gbp_fetch')
  }

  if (allLocations.length === 0) return redirectError('no_gbp_locations')

  // ── 4. Persist locations, brand voices, and tokens ─────────────────────────

  const supabase = buildSupabase()

  try {
    for (const gbpLocation of allLocations) {
      const locationId = await upsertLocation(
        supabase,
        gbpLocation.name,
        gbpLocation.locationName,
        ownerId,
      )
      await Promise.all([
        ensureBrandVoice(supabase, locationId),
        upsertOAuthTokens(supabase, locationId, accessToken, refreshToken, expiresAt),
      ])
    }
  } catch (err) {
    console.error('DB write error:', err)
    return redirectError('db_write')
  }

  // ── 5. Clear state cookie and redirect to onboarding ──────────────────────

  const response = NextResponse.redirect(`${appOrigin}/onboarding`)
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth/google',
  })
  return response
}
