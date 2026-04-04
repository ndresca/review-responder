import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// ─── Clients ─────────────────────────────────────────────────────────────────

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuthUser() {
  const cookieStore = await cookies()
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ─── POST — enable auto-post after calibration ───────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let locationId: string
  let frequency: 'daily' | 'weekly'
  let digestDay: number | undefined
  let digestTime: number
  let timezone: string

  try {
    const body = (await request.json()) as {
      locationId?: string
      frequency?: string
      digestDay?: number
      digestTime?: number
      timezone?: string
    }

    if (!body.locationId) return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    if (!body.frequency || !['daily', 'weekly'].includes(body.frequency)) {
      return NextResponse.json({ error: 'frequency must be daily | weekly' }, { status: 400 })
    }
    if (body.frequency === 'weekly' && (body.digestDay === undefined || body.digestDay === null)) {
      return NextResponse.json({ error: 'digestDay is required for weekly frequency' }, { status: 400 })
    }
    if (body.digestTime === undefined || body.digestTime < 0 || body.digestTime > 23) {
      return NextResponse.json({ error: 'digestTime must be 0–23' }, { status: 400 })
    }
    if (!body.timezone) {
      return NextResponse.json({ error: 'timezone is required' }, { status: 400 })
    }

    locationId = body.locationId
    frequency = body.frequency as 'daily' | 'weekly'
    digestDay = body.digestDay
    digestTime = body.digestTime
    timezone = body.timezone
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = buildServiceSupabase()

  // Verify ownership
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  if ((location.owner_id as string) !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify calibration is complete
  const { data: bv, error: bvErr } = await supabase
    .from('brand_voices')
    .select('calibration_examples_accepted')
    .eq('location_id', locationId)
    .single()

  if (bvErr || !bv) return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })

  if ((bv.calibration_examples_accepted as number) < 3) {
    return NextResponse.json(
      { error: 'Calibration not complete — at least 3 examples must be accepted' },
      { status: 422 },
    )
  }

  // Save digest preferences (upsert — location_id is unique in notification_preferences)
  const { error: prefsErr } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        location_id: locationId,
        digest_frequency: frequency,
        digest_day: frequency === 'weekly' ? (digestDay ?? null) : null,
        digest_time: digestTime,
        timezone,
        failure_alerts: true,
      },
      { onConflict: 'location_id' },
    )

  if (prefsErr) {
    console.error('upsert notification_preferences failed:', prefsErr)
    return NextResponse.json({ error: 'Failed to save notification preferences' }, { status: 500 })
  }

  // Enable auto-post
  const { error: autoPostErr } = await supabase
    .from('brand_voices')
    .update({ auto_post_enabled: true })
    .eq('location_id', locationId)

  if (autoPostErr) {
    console.error('enable auto_post_enabled failed:', autoPostErr)
    return NextResponse.json({ error: 'Failed to enable auto-post' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
