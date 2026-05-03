import { NextResponse } from 'next/server'
import { getAuthedSupabase } from '@/lib/session'

// Returns the dashboard's data shape:
//   { locationId, locationName, autoPostEnabled, weeklyPostedCount,
//     recentResponses: [{ reviewId, reviewerName, rating, reviewText,
//                         responseText, status, postedAt }] }
//
// Uses a user-scoped Supabase client (anon key + sb-* cookies) so RLS
// policies enforce row-level access automatically. If a future change
// accidentally drops an owner_id filter, RLS catches it instead of
// leaking another user's data.
//
// Multi-location accounts get the oldest location only (matches settings/load).
export async function GET(): Promise<NextResponse> {
  const authed = await getAuthedSupabase()
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabase } = authed

  // 1. Owner's first location. RLS policy "auth.uid() = owner_id" scopes
  //    this to the caller's locations automatically — owner_id filter is
  //    redundant but kept as belt-and-suspenders.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (locErr) {
    console.error('dashboard/load: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }

  if (!location) {
    return NextResponse.json({
      locationId: null,
      locationName: null,
      autoPostEnabled: false,
      weeklyPostedCount: 0,
      recentResponses: [],
    })
  }

  const locationId = location.id as string
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 2/3/4/5. Brand voice (auto_post_enabled), weekly count, last 5 posted
  // responses, subscription state — in parallel. responses_posted has no
  // created_at; posted_at is the only timestamp on the row, null until
  // status='posted'. subscriptions row is null when the user reached
  // /dashboard via the skip-Stripe path or before completing checkout.
  const [bvResult, weeklyResult, recentResult, subResult] = await Promise.all([
    supabase
      .from('brand_voices')
      .select('auto_post_enabled')
      .eq('location_id', locationId)
      .maybeSingle(),
    supabase
      .from('responses_posted')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .eq('status', 'posted')
      .gte('posted_at', sevenDaysAgoIso),
    supabase
      .from('responses_posted')
      .select('review_id, text, status, posted_at')
      .eq('location_id', locationId)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(5),
    supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('location_id', locationId)
      .maybeSingle(),
  ])

  if (bvResult.error) console.warn('dashboard/load: brand_voices read failed:', bvResult.error.message)
  if (weeklyResult.error) console.warn('dashboard/load: weekly count failed:', weeklyResult.error.message)
  if (recentResult.error) console.warn('dashboard/load: recent responses read failed:', recentResult.error.message)
  if (subResult.error) console.warn('dashboard/load: subscriptions read failed:', subResult.error.message)

  const autoPostEnabled = (bvResult.data?.auto_post_enabled as boolean) ?? false
  const weeklyPostedCount = weeklyResult.count ?? 0
  const responseRows = (recentResult.data ?? []) as Array<{
    review_id: string
    text: string
    status: string
    posted_at: string | null
  }>

  // 5. Hydrate review metadata (reviewer_name, rating, review_text) for each
  //    recent response. responses_posted.review_id is the google_review_id;
  //    the join key on the reviews table is (location_id, google_review_id).
  //    No FK relationship to lean on, so we do it in JS.
  type ReviewMetaRow = {
    google_review_id: string
    reviewer_name: string
    rating: number
    text: string
  }
  let reviewMetaByGoogleId = new Map<string, ReviewMetaRow>()
  if (responseRows.length > 0) {
    const reviewIds = responseRows.map(r => r.review_id)
    const { data: reviewRows, error: reviewsErr } = await supabase
      .from('reviews')
      .select('google_review_id, reviewer_name, rating, text')
      .eq('location_id', locationId)
      .in('google_review_id', reviewIds)

    if (reviewsErr) {
      console.warn('dashboard/load: reviews lookup failed:', reviewsErr.message)
    } else {
      reviewMetaByGoogleId = new Map(
        (reviewRows as ReviewMetaRow[] ?? []).map(r => [r.google_review_id, r]),
      )
    }
  }

  const recentResponses = responseRows.map(r => {
    const meta = reviewMetaByGoogleId.get(r.review_id)
    return {
      reviewId: r.review_id,
      reviewerName: meta?.reviewer_name ?? '',
      rating: (meta?.rating as number | undefined) ?? 0,
      reviewText: meta?.text ?? '',
      responseText: r.text,
      status: r.status,
      postedAt: r.posted_at,
    }
  })

  return NextResponse.json({
    locationId,
    locationName: location.name as string,
    autoPostEnabled,
    weeklyPostedCount,
    recentResponses,
    subscription: subResult.data
      ? {
          status: subResult.data.status as string,
          trialEndsAt: (subResult.data.current_period_end as string | null) ?? null,
        }
      : null,
  })
}
