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

// Default fields used when bootstrapping a brand_voices row for a location
// that doesn't have one yet (e.g. user clicks the dashboard toggle before
// finishing onboarding). Mirrors ensureBrandVoice() in
// src/app/api/auth/google/callback/route.ts — keep these in sync.
const BRAND_VOICE_DEFAULTS = {
  personality: '',
  avoid: '',
  signature_phrases: [] as string[],
  language: 'en',
  calibration_examples_accepted: 0,
}

// Flips brand_voices.auto_post_enabled for the owner's first location.
// Returns the new value. Shared by the dashboard pill and the settings
// danger-zone Pause/Resume button so both UIs render the same source of
// truth.
//
// If no brand_voices row exists yet (user toggled before onboarding
// completed), creates one with empty defaults and auto_post_enabled=true.
// Previously this hard-failed with "Brand voice not found".
export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const session = await getValidSession(cookieStore)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = session.ownerId

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

  // Manual upsert: read current row (if any), then branch to insert-or-update.
  // We can't use .upsert({ onConflict: 'location_id' }) because brand_voices
  // has no unique constraint on location_id (only the FK to locations).
  // Postgres ON CONFLICT requires a unique index on the conflict column —
  // without it, Supabase returns "no unique or exclusion constraint matching
  // the ON CONFLICT specification". Same effective semantics either way:
  // missing row → create with defaults + auto_post_enabled=true; existing
  // row → flip the boolean.
  const { data: bv, error: bvErr } = await supabase
    .from('brand_voices')
    .select('id, auto_post_enabled')
    .eq('location_id', locationId)
    .maybeSingle()

  if (bvErr) {
    console.error('toggle-auto-post: brand_voices read failed:', bvErr.message)
    return NextResponse.json({ error: 'Failed to read brand voice' }, { status: 500 })
  }

  if (!bv) {
    // No row yet — create one with defaults. Toggle semantics: the
    // "current" state is implicit-false (no row), so the "next" state is
    // explicit-true.
    const { error: insertErr } = await supabase
      .from('brand_voices')
      .insert({
        location_id: locationId,
        ...BRAND_VOICE_DEFAULTS,
        auto_post_enabled: true,
      } as never)

    if (insertErr) {
      console.error('toggle-auto-post: brand_voices insert failed:', insertErr.message)
      return NextResponse.json({ error: 'Failed to create brand voice' }, { status: 500 })
    }
    return NextResponse.json({ autoPostEnabled: true })
  }

  // Row exists — flip the boolean. Update by primary key so we don't risk
  // touching any duplicate rows that may have leaked in (brand_voices has no
  // unique on location_id, so duplicates are technically possible).
  const next = !(bv.auto_post_enabled as boolean)

  const { error: updateErr } = await supabase
    .from('brand_voices')
    .update({ auto_post_enabled: next } as never)
    .eq('id', bv.id)

  if (updateErr) {
    console.error('toggle-auto-post: update failed:', updateErr.message)
    return NextResponse.json({ error: 'Failed to update auto-post' }, { status: 500 })
  }

  return NextResponse.json({ autoPostEnabled: next })
}
