import { NextResponse } from 'next/server'
import { getAuthedSupabase } from '@/lib/session'

// Returns the owner's settings shape used by the settings page on mount:
// { locationId, restaurantName, brandVoice: {...}, notifications: {...},
//   subscription: { status, currentPeriodEnd }, autoPostEnabled }.
//
// Uses a user-scoped Supabase client (anon key + sb-* cookies) so RLS
// policies enforce row-level access automatically. The owner_id filter
// is implicit via RLS.
//
// "First location" — multi-location accounts get the oldest by created_at.
// brandVoice and notifications fall back to nulls if the rows don't exist
// yet (which can happen if the user skipped golive); the page seeds defaults
// from those nulls.
export async function GET(): Promise<NextResponse> {
  const authed = await getAuthedSupabase()
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, supabase } = authed
  // user.email is populated from auth.users when auth.getUser() validates
  // against the auth server — surfaces in the GBP "connected" pill.
  const userEmail = user.email ?? null

  // Find the owner's first (oldest) location.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('id, name, google_location_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (locErr) {
    console.error('load: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }

  // No locations yet — return a shape the page can handle (loading completes
  // with empty defaults, save buttons will surface the missing-location state).
  if (!location) {
    return NextResponse.json({
      locationId: null,
      restaurantName: null,
      email: userEmail,
      brandVoice: null,
      notifications: null,
      subscription: null,
      autoPostEnabled: false,
    })
  }

  const locationId = location.id as string

  // Brand voice + notification preferences may not exist if onboarding
  // didn't complete — both queries are best-effort. autoPostEnabled is
  // surfaced separately at the top level of the response so the settings
  // page's Pause/Resume button can hydrate without parsing brandVoice.
  const [bvResult, npResult, subResult] = await Promise.all([
    supabase
      .from('brand_voices')
      .select('personality, avoid, language, owner_description, auto_post_enabled')
      .eq('location_id', locationId)
      .maybeSingle(),
    supabase
      .from('notification_preferences')
      .select('digest_frequency, digest_day, digest_time, timezone, failure_alerts')
      .eq('location_id', locationId)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('location_id', locationId)
      .maybeSingle(),
  ])

  if (bvResult.error) console.warn('load: brand_voices read failed:', bvResult.error.message)
  if (npResult.error) console.warn('load: notification_preferences read failed:', npResult.error.message)
  if (subResult.error) console.warn('load: subscriptions read failed:', subResult.error.message)

  return NextResponse.json({
    locationId,
    restaurantName: location.name as string,
    email: userEmail,
    brandVoice: bvResult.data ? {
      personality: bvResult.data.personality as string,
      avoid: bvResult.data.avoid as string,
      language: (bvResult.data.language as string) ?? 'en',
      ownerDescription: (bvResult.data.owner_description as string | null) ?? null,
    } : null,
    notifications: npResult.data ? {
      frequency: npResult.data.digest_frequency as 'daily' | 'weekly',
      digestDay: (npResult.data.digest_day as number | null) ?? null,
      digestTime: npResult.data.digest_time as number,
      timezone: (npResult.data.timezone as string | null) ?? null,
      failureAlerts: (npResult.data.failure_alerts as boolean) ?? true,
    } : null,
    subscription: subResult.data ? {
      status: subResult.data.status as string,
      currentPeriodEnd: (subResult.data.current_period_end as string | null) ?? null,
    } : null,
    autoPostEnabled: (bvResult.data?.auto_post_enabled as boolean) ?? false,
  })
}
