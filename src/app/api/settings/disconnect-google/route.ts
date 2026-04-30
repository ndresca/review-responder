import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getValidSession } from '@/lib/session'

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Disconnects the owner's Google Business Profile from their first location.
// - Deletes the oauth_tokens row (so the cron loop has nothing to fetch with).
// - Sets brand_voices.auto_post_enabled = false so the cron also short-circuits
//   on the brand-voice gate even if the row delete somehow fails.
//
// Service-role: oauth_tokens has RLS policy "no direct client access" — even
// the user's own auth.uid() can't read or delete that row. Service-role bypass
// is the only path. Same reason the OAuth callback uses service-role.
export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const session = await getValidSession(cookieStore)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = session.ownerId

  const supabase = buildServiceSupabase()

  // Find the owner's first location — same rule the load endpoints use.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (locErr) {
    console.error('disconnect-google: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }
  if (!location) {
    return NextResponse.json({ error: 'No location found' }, { status: 404 })
  }

  const locationId = location.id as string

  // Delete the oauth_tokens row. After this, processLocation in
  // services/auto-post.ts will throw "No OAuth tokens for location" and skip
  // — which is the desired behavior (no posting without owner consent).
  const { error: tokenErr } = await supabase
    .from('oauth_tokens')
    .delete()
    .eq('location_id', locationId)

  if (tokenErr) {
    console.error('disconnect-google: oauth_tokens delete failed:', tokenErr.message)
    return NextResponse.json({ error: 'Failed to disconnect Google.' }, { status: 500 })
  }

  // Belt-and-suspenders: flip auto_post_enabled to false so the cron also
  // short-circuits on the brand-voice gate. Idempotent if no row exists.
  const { error: bvErr } = await supabase
    .from('brand_voices')
    .update({ auto_post_enabled: false } as never)
    .eq('location_id', locationId)

  if (bvErr) {
    // Non-fatal — the token delete already neutralized auto-posting. Log and
    // proceed with success.
    console.warn('disconnect-google: brand_voices update failed (non-fatal):', bvErr.message)
  }

  return NextResponse.json({ success: true })
}
