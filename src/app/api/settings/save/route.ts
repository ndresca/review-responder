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

type SaveBody = {
  locationId?: string
  restaurantName?: string
  personality?: string
  avoid?: string
  signaturePhrases?: string[]
  language?: string
  frequency?: 'daily' | 'weekly'
  digestDay?: number | null
  digestTime?: number
  timezone?: string
}

// Length caps — bounds prompt size for downstream LLM calls and prevents
// users from writing 1GB of text into a TEXT column that would then crash
// every cron tick that loads it. Returns null if the input passes; an error
// response if it doesn't.
const MAX_LENGTHS = {
  restaurantName: 200,
  personality: 1000,
  avoid: 500,
  signaturePhraseCount: 10,
  signaturePhraseLength: 100,
} as const

function validateLengths(body: SaveBody): NextResponse | null {
  if (typeof body.restaurantName === 'string' && body.restaurantName.length > MAX_LENGTHS.restaurantName) {
    return NextResponse.json({ error: `restaurantName must be ${MAX_LENGTHS.restaurantName} characters or fewer` }, { status: 400 })
  }
  if (typeof body.personality === 'string' && body.personality.length > MAX_LENGTHS.personality) {
    return NextResponse.json({ error: `personality must be ${MAX_LENGTHS.personality} characters or fewer` }, { status: 400 })
  }
  if (typeof body.avoid === 'string' && body.avoid.length > MAX_LENGTHS.avoid) {
    return NextResponse.json({ error: `avoid must be ${MAX_LENGTHS.avoid} characters or fewer` }, { status: 400 })
  }
  if (Array.isArray(body.signaturePhrases)) {
    if (body.signaturePhrases.length > MAX_LENGTHS.signaturePhraseCount) {
      return NextResponse.json({ error: `signaturePhrases can have at most ${MAX_LENGTHS.signaturePhraseCount} items` }, { status: 400 })
    }
    for (const phrase of body.signaturePhrases) {
      if (typeof phrase === 'string' && phrase.length > MAX_LENGTHS.signaturePhraseLength) {
        return NextResponse.json({ error: `each signature phrase must be ${MAX_LENGTHS.signaturePhraseLength} characters or fewer` }, { status: 400 })
      }
    }
  }
  return null
}

export async function POST(request: Request): Promise<NextResponse> {
  // Auth: validated session cookie. getValidSession verifies the cookie
  // value is a UUID AND that the user still exists in auth.users.
  const cookieStore = await cookies()
  const session = await getValidSession(cookieStore)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = session.ownerId

  let body: SaveBody
  try {
    body = (await request.json()) as SaveBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const lengthError = validateLengths(body)
  if (lengthError) return lengthError

  const { locationId, personality, avoid, signaturePhrases, language,
          frequency, digestDay, digestTime, timezone } = body

  if (!locationId) return NextResponse.json({ error: 'locationId is required' }, { status: 400 })

  const supabase = buildServiceSupabase()

  // Verify the caller actually owns the target location before any writes.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  if ((location.owner_id as string) !== ownerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── brand_voices (UPDATE — row already exists from onboarding) ──────────
  const bvUpdate: Record<string, unknown> = {}
  if (typeof personality === 'string') bvUpdate.personality = personality
  if (typeof avoid === 'string') bvUpdate.avoid = avoid
  if (Array.isArray(signaturePhrases)) bvUpdate.signature_phrases = signaturePhrases
  if (typeof language === 'string') bvUpdate.language = language

  if (Object.keys(bvUpdate).length > 0) {
    const { error: bvErr } = await supabase
      .from('brand_voices')
      .update(bvUpdate as never)
      .eq('location_id', locationId)
    if (bvErr) {
      console.error('save: brand_voices update failed:', bvErr.message)
      return NextResponse.json({ error: 'Failed to save brand voice' }, { status: 500 })
    }
  }

  // ── notification_preferences (UPSERT — row may not exist if user skipped golive) ──
  const npRow: Record<string, unknown> = { location_id: locationId }
  if (frequency) {
    npRow.digest_frequency = frequency
    // digest_day must be 0–6 for weekly, null for daily — schema CHECK enforces this.
    npRow.digest_day = frequency === 'weekly' ? (digestDay ?? null) : null
  }
  if (typeof digestTime === 'number') npRow.digest_time = digestTime
  if (typeof timezone === 'string') npRow.timezone = timezone

  // Only upsert if at least one notification field was provided. Avoids creating
  // an all-defaults row that would silently override what golive set.
  if (Object.keys(npRow).length > 1) {
    const { error: npErr } = await supabase
      .from('notification_preferences')
      .upsert(npRow as never, { onConflict: 'location_id' })
    if (npErr) {
      console.error('save: notification_preferences upsert failed:', npErr.message)
      return NextResponse.json({ error: 'Failed to save notification preferences' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
