import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

type SaveBody = {
  locationId?: string
  personality?: string
  avoid?: string
  signaturePhrases?: string[]
  language?: string
  frequency?: 'daily' | 'weekly'
  digestDay?: number | null
  digestTime?: number
  timezone?: string
}

export async function POST(request: Request): Promise<NextResponse> {
  // Auth: read the lightweight session cookie set by the OAuth callback.
  // The cookie value is the auth user's id (ownerId). httpOnly so client JS
  // can't read it — only this server-side route can.
  const cookieStore = await cookies()
  const ownerId = cookieStore.get('autoplier_session')?.value
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: SaveBody
  try {
    body = (await request.json()) as SaveBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

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
