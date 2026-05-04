import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getValidSession } from '@/lib/session'
import type { ContactChannel } from '@/lib/types'

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

type SaveBody = {
  locationId?: string
  restaurantName?: string
  // Long-form brand voice description shown as the textarea on
  // onboarding step 2 + settings → "Voz de marca". Persisted to
  // brand_voices.owner_description so back-nav and the language
  // hard-reload can rehydrate it.
  ownerDescription?: string
  personality?: string
  avoid?: string
  language?: string
  // When true, the auto-post pipeline detects the review's language and
  // responds in that language. When false, all responses use `language`.
  autoDetectLanguage?: boolean
  // Owner-allowlisted channels the AI may reference in replies. PR A
  // shipped the schema, PR B the validator hook, PR C the prompt wiring.
  // PR D (this PR) is the user-facing surface. Optional — empty array is
  // valid and means "no channels configured".
  contactChannels?: ContactChannel[]
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
  ownerDescription: 2000,
  personality: 1000,
  avoid: 500,
  // Channel field caps. id is the client-generated UUID — capped at 64 to
  // forbid DoS-shape ids without rejecting RFC-4122 v4 (36 chars) or any
  // future scheme. label/value/when_to_use bound prompt size: each channel
  // contributes label + value + when_to_use to the prompt, and 5 channels
  // at full caps total ~4KB which is comfortable inside the calibration +
  // generate-response prompts.
  channelId: 64,
  channelLabel: 100,
  channelValue: 200,
  channelWhenToUse: 500,
} as const

const MAX_CHANNELS = 5

// Returns 400 NextResponse on the first validation failure; null if the
// channels block passes. Skips entirely when contactChannels is undefined
// (omitted from body) — only validates when the caller is actually
// trying to write the field.
function validateChannels(channels: unknown): NextResponse | null {
  if (channels === undefined) return null
  if (!Array.isArray(channels)) {
    return NextResponse.json({ error: 'contactChannels must be an array' }, { status: 400 })
  }
  if (channels.length > MAX_CHANNELS) {
    return NextResponse.json({ error: `contactChannels: maximum ${MAX_CHANNELS} channels allowed` }, { status: 400 })
  }
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i] as Partial<ContactChannel> | null
    if (!c || typeof c !== 'object') {
      return NextResponse.json({ error: `contactChannels[${i}]: must be an object` }, { status: 400 })
    }
    // Each field is required and non-empty after trim. Empty rows are
    // expected to be filtered client-side before POST; if one slips
    // through we reject loudly so the caller can see the bug.
    if (typeof c.id !== 'string' || c.id.trim().length === 0) {
      return NextResponse.json({ error: `contactChannels[${i}].id is required` }, { status: 400 })
    }
    if (c.id.length > MAX_LENGTHS.channelId) {
      return NextResponse.json({ error: `contactChannels[${i}].id must be ${MAX_LENGTHS.channelId} characters or fewer` }, { status: 400 })
    }
    if (typeof c.label !== 'string' || c.label.trim().length === 0) {
      return NextResponse.json({ error: `contactChannels[${i}].label is required` }, { status: 400 })
    }
    if (c.label.length > MAX_LENGTHS.channelLabel) {
      return NextResponse.json({ error: `contactChannels[${i}].label must be ${MAX_LENGTHS.channelLabel} characters or fewer` }, { status: 400 })
    }
    if (typeof c.value !== 'string' || c.value.trim().length === 0) {
      return NextResponse.json({ error: `contactChannels[${i}].value is required` }, { status: 400 })
    }
    if (c.value.length > MAX_LENGTHS.channelValue) {
      return NextResponse.json({ error: `contactChannels[${i}].value must be ${MAX_LENGTHS.channelValue} characters or fewer` }, { status: 400 })
    }
    if (typeof c.when_to_use !== 'string' || c.when_to_use.trim().length === 0) {
      return NextResponse.json({ error: `contactChannels[${i}].when_to_use is required` }, { status: 400 })
    }
    if (c.when_to_use.length > MAX_LENGTHS.channelWhenToUse) {
      return NextResponse.json({ error: `contactChannels[${i}].when_to_use must be ${MAX_LENGTHS.channelWhenToUse} characters or fewer` }, { status: 400 })
    }
  }
  return null
}

function validateLengths(body: SaveBody): NextResponse | null {
  if (typeof body.restaurantName === 'string' && body.restaurantName.length > MAX_LENGTHS.restaurantName) {
    return NextResponse.json({ error: `restaurantName must be ${MAX_LENGTHS.restaurantName} characters or fewer` }, { status: 400 })
  }
  if (typeof body.ownerDescription === 'string' && body.ownerDescription.length > MAX_LENGTHS.ownerDescription) {
    return NextResponse.json({ error: `ownerDescription must be ${MAX_LENGTHS.ownerDescription} characters or fewer` }, { status: 400 })
  }
  if (typeof body.personality === 'string' && body.personality.length > MAX_LENGTHS.personality) {
    return NextResponse.json({ error: `personality must be ${MAX_LENGTHS.personality} characters or fewer` }, { status: 400 })
  }
  if (typeof body.avoid === 'string' && body.avoid.length > MAX_LENGTHS.avoid) {
    return NextResponse.json({ error: `avoid must be ${MAX_LENGTHS.avoid} characters or fewer` }, { status: 400 })
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

  const channelsError = validateChannels(body.contactChannels)
  if (channelsError) return channelsError

  const { locationId, restaurantName, ownerDescription, personality, avoid,
          language, autoDetectLanguage, contactChannels, frequency, digestDay,
          digestTime, timezone } = body

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

  // ── locations.name (UPDATE) ─────────────────────────────────────────────
  // Owners edit the display name from settings + during onboarding step 2.
  // Was previously declared in SaveBody and length-validated but silently
  // dropped on the way to the DB — this is the actual cause of "step 2
  // restaurant name lost on language switch": the hard reload re-reads
  // from DB, which still held the OAuth-callback default.
  if (typeof restaurantName === 'string' && restaurantName.trim().length > 0) {
    const { error: locUpdateErr } = await supabase
      .from('locations')
      .update({ name: restaurantName.trim() })
      .eq('id', locationId)
    if (locUpdateErr) {
      console.error('save: locations.name update failed:', locUpdateErr.message)
      return NextResponse.json({ error: 'Failed to save restaurant name' }, { status: 500 })
    }
  }

  // ── brand_voices (UPDATE — row already exists from onboarding) ──────────
  const bvUpdate: Record<string, unknown> = {}
  if (typeof ownerDescription === 'string') bvUpdate.owner_description = ownerDescription
  if (typeof personality === 'string') bvUpdate.personality = personality
  if (typeof avoid === 'string') bvUpdate.avoid = avoid
  if (typeof language === 'string') bvUpdate.language = language
  if (typeof autoDetectLanguage === 'boolean') bvUpdate.auto_detect_language = autoDetectLanguage
  // contactChannels: only write when the caller explicitly sent the field.
  // Sending `[]` is a valid "clear all channels" intent, distinct from
  // omitting the field entirely (which leaves the existing row alone).
  if (Array.isArray(contactChannels)) bvUpdate.contact_channels = contactChannels

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
