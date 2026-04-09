import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from './crypto'

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'

type SbSingleResult<T> = { data: T | null; error: { message: string } | null }

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Exchanges a refresh token for a new access token.
 */
export async function refreshAccessToken(
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
    const body = await res.text()
    throw new Error(`Token refresh failed: HTTP ${res.status} — ${body}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

/**
 * Returns a valid access token for a location, refreshing if expired.
 *
 * Uses `refreshing_since` as a lightweight lock to prevent concurrent
 * refresh attempts from multiple cron invocations.
 */
export async function getValidAccessToken(locationId: string): Promise<string> {
  const supabase = getSupabase()

  const { data: row, error } = await supabase
    .from('oauth_tokens')
    .select('access_token_encrypted, access_token_iv, refresh_token_encrypted, refresh_token_iv, expires_at, refreshing_since')
    .eq('location_id', locationId)
    .single() as unknown as SbSingleResult<{
      access_token_encrypted: string; access_token_iv: string;
      refresh_token_encrypted: string; refresh_token_iv: string;
      expires_at: string; refreshing_since: string | null;
    }>

  if (error || !row) throw new Error(`No OAuth tokens for location ${locationId}`)

  const expiresAt = new Date(row.expires_at)
  const bufferMs = 5 * 60 * 1000 // refresh 5 min before expiry

  // Token still valid — decrypt and return
  if (expiresAt.getTime() - Date.now() > bufferMs) {
    return decrypt(row.access_token_encrypted, row.access_token_iv)
  }

  // Another instance is already refreshing — wait briefly or return stale token
  if (row.refreshing_since) {
    const lockAge = Date.now() - new Date(row.refreshing_since).getTime()
    if (lockAge < 30_000) {
      // Lock is fresh — return current token (still likely valid for a few minutes)
      return decrypt(row.access_token_encrypted, row.access_token_iv)
    }
    // Lock is stale (>30s) — proceed with refresh
  }

  // Set refreshing lock
  await supabase
    .from('oauth_tokens')
    .update({ refreshing_since: new Date().toISOString() } as never)
    .eq('location_id', locationId)

  try {
    const refreshToken = decrypt(row.refresh_token_encrypted, row.refresh_token_iv)
    const { accessToken, expiresAt: newExpiry } = await refreshAccessToken(refreshToken)

    const { ciphertext: accessEnc, iv: accessIv } = encrypt(accessToken)

    await supabase
      .from('oauth_tokens')
      .update({
        access_token_encrypted: accessEnc,
        access_token_iv: accessIv,
        expires_at: newExpiry.toISOString(),
        refreshing_since: null,
      } as never)
      .eq('location_id', locationId)

    return accessToken
  } catch (err) {
    // Clear lock on failure
    await supabase
      .from('oauth_tokens')
      .update({ refreshing_since: null } as never)
      .eq('location_id', locationId)
    throw err
  }
}
