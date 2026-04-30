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

// Returns the dashboard's data shape:
//   { locationId, locationName, autoPostEnabled, weeklyPostedCount,
//     recentResponses: [{ reviewId, reviewerName, rating, reviewText,
//                         responseText, status, postedAt }] }
//
// Multi-location accounts get the oldest location only (matches settings/load).
// Brand voice / responses are best-effort — a missing brand_voices row defaults
// autoPostEnabled to false rather than 500ing.
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const session = await getValidSession(cookieStore)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = session.ownerId

  const supabase = buildServiceSupabase()

  // 1. Owner's first location.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('id, name')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (locErr) {
    console.error('dashboard/load: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }

  if (!location) {
    // No location yet — return an empty shape the page can render. The
    // middleware blocks unauthenticated traffic; if we get here, the user
    // is signed in but onboarding never finished.
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

  // 2/3/4. Brand voice (auto_post_enabled), weekly count, and the last 5
  // posted responses, all in parallel. responses_posted has no created_at —
  // posted_at is the only timestamp on the row, and it's null until status
  // flips to 'posted'. Both the count and the list filter to status='posted'
  // so failed/blocked rows don't pollute the dashboard's "recent activity"
  // story.
  const [bvResult, weeklyResult, recentResult] = await Promise.all([
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
  ])

  if (bvResult.error) console.warn('dashboard/load: brand_voices read failed:', bvResult.error.message)
  if (weeklyResult.error) console.warn('dashboard/load: weekly count failed:', weeklyResult.error.message)
  if (recentResult.error) console.warn('dashboard/load: recent responses read failed:', recentResult.error.message)

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
  //    No Supabase nested-select FK relationship to lean on, so we do it in JS.
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
  })
}
