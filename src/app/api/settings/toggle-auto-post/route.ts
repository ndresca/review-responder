import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Flips brand_voices.auto_post_enabled for the owner's first location and
// returns the new value. Shared by the dashboard's auto-replies pill and
// the settings danger-zone Pause/Resume button — both UIs render from the
// returned autoPostEnabled so they stay in sync.
export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const ownerId = cookieStore.get('autoplier_session')?.value
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = buildServiceSupabase()

  // Find the owner's first location — same "oldest by created_at" rule the
  // settings/dashboard load endpoints use.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (locErr) {
    console.error('toggle-auto-post: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }
  if (!location) {
    return NextResponse.json({ error: 'No location found' }, { status: 404 })
  }

  const locationId = location.id as string

  // Read current value, then flip. Using read-then-write rather than a SQL
  // toggle expression keeps this in plain Supabase calls. Race window: two
  // toggles fired within a few ms could both read the same value and both
  // write the same result — acceptable for a single-user toggle button.
  const { data: bv, error: bvErr } = await supabase
    .from('brand_voices')
    .select('auto_post_enabled')
    .eq('location_id', locationId)
    .maybeSingle()

  if (bvErr || !bv) {
    console.error('toggle-auto-post: brand_voices read failed:', bvErr?.message ?? 'no row')
    return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })
  }

  const next = !(bv.auto_post_enabled as boolean)

  const { error: updateErr } = await supabase
    .from('brand_voices')
    .update({ auto_post_enabled: next } as never)
    .eq('location_id', locationId)

  if (updateErr) {
    console.error('toggle-auto-post: update failed:', updateErr.message)
    return NextResponse.json({ error: 'Failed to update auto-post' }, { status: 500 })
  }

  return NextResponse.json({ autoPostEnabled: next })
}
