import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Returns every response_posted row for the owner's first location, joined
// with its review metadata, ordered by reviews.created_at DESC. Used by the
// /history page to show the full review-and-response log.
//
// responses_posted has no created_at column (only posted_at, which is null
// until status flips to 'posted'). reviews.created_at is the closest stable
// "when did this happen" timestamp and orders the page sensibly.
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const ownerId = cookieStore.get('autoplier_session')?.value
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    console.error('history/load: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }

  if (!location) {
    return NextResponse.json({
      locationId: null,
      locationName: null,
      entries: [],
    })
  }

  const locationId = location.id as string

  // 2. All response rows for the location (every status).
  const { data: responseRows, error: respErr } = await supabase
    .from('responses_posted')
    .select('review_id, text, status, posted_at')
    .eq('location_id', locationId)

  if (respErr) {
    console.error('history/load: responses_posted read failed:', respErr.message)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }

  const responses = (responseRows ?? []) as Array<{
    review_id: string
    text: string
    status: string
    posted_at: string | null
  }>

  if (responses.length === 0) {
    return NextResponse.json({
      locationId,
      locationName: location.name as string,
      entries: [],
    })
  }

  // 3. Hydrate review metadata. responses_posted.review_id holds the
  //    google_review_id; the join key on reviews is (location_id,
  //    google_review_id). No FK between the two — done in JS.
  const reviewIds = responses.map(r => r.review_id)
  const { data: reviewRows, error: revErr } = await supabase
    .from('reviews')
    .select('google_review_id, reviewer_name, rating, text, created_at')
    .eq('location_id', locationId)
    .in('google_review_id', reviewIds)

  if (revErr) {
    console.warn('history/load: reviews lookup failed (continuing without metadata):', revErr.message)
  }

  type ReviewMeta = {
    google_review_id: string
    reviewer_name: string
    rating: number
    text: string
    created_at: string
  }
  const reviewByGoogleId = new Map<string, ReviewMeta>(
    ((reviewRows as ReviewMeta[] | null) ?? []).map(r => [r.google_review_id, r]),
  )

  // 4. Merge + order by reviews.created_at DESC. Rows missing a corresponding
  //    review (shouldn't happen but defensive) sort last with empty metadata.
  const entries = responses
    .map(r => {
      const meta = reviewByGoogleId.get(r.review_id)
      return {
        reviewId: r.review_id,
        reviewerName: meta?.reviewer_name ?? '',
        rating: meta?.rating ?? 0,
        reviewText: meta?.text ?? '',
        reviewCreatedAt: meta?.created_at ?? null,
        responseText: r.text,
        status: r.status,
        postedAt: r.posted_at,
      }
    })
    .sort((a, b) => {
      if (!a.reviewCreatedAt && !b.reviewCreatedAt) return 0
      if (!a.reviewCreatedAt) return 1
      if (!b.reviewCreatedAt) return -1
      return b.reviewCreatedAt.localeCompare(a.reviewCreatedAt)
    })

  return NextResponse.json({
    locationId,
    locationName: location.name as string,
    entries,
  })
}
