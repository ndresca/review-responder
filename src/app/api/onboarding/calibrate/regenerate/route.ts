import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { regenerateExample } from '@/services/calibration'
import type { ScenarioType } from '@/lib/types'

// POST /api/onboarding/calibrate/regenerate
//
// Drives the calibration step 3 "Edit brand voice" panel's per-card
// regeneration. Owner clicks Save in the panel, the brand voice is
// persisted via /api/settings/save, then the client hits THIS endpoint
// once per non-accepted card. Each call generates a fresh AI response
// for the card's scenario using the (just-updated) brand voice from the
// `brand_voices` row.
//
// Distinct from the existing PATCH /api/onboarding/calibrate (which
// records an owner decision and side-effect-regens after edit/reject).
// This endpoint:
//   • does NOT record a decision against the existing example
//   • does NOT bump the rejection counter
//   • simply produces a fresh sibling example in the same session
//
// Rate limit: 10 regenerations per session per hour. Each regen costs
// ~$0.40 in OpenAI usage; an owner click-spamming the panel Save button
// would otherwise burn through credits fast. Counted by examples
// inserted into the session in the last 60 minutes.

const REGENERATE_RATE_LIMIT = 10
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

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

export async function POST(request: Request): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ownerId = user.id

  // ── Body parse ─────────────────────────────────────────────────────────────
  let exampleId: string
  try {
    const body = (await request.json()) as { exampleId?: unknown }
    if (typeof body.exampleId !== 'string' || !body.exampleId) {
      return NextResponse.json({ error: 'exampleId is required' }, { status: 400 })
    }
    exampleId = body.exampleId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = buildServiceSupabase()

  // ── Look up the example + ownership chain ─────────────────────────────────
  // Server-side ownership verification: the example must point at a
  // location owned by the calling user, otherwise we'd let any owner
  // burn another owner's OpenAI budget.
  const { data: example, error: exErr } = await supabase
    .from('calibration_examples')
    .select('id, session_id, location_id, scenario_type')
    .eq('id', exampleId)
    .single()

  if (exErr || !example) {
    return NextResponse.json({ error: 'Example not found' }, { status: 404 })
  }

  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id, google_location_id')
    .eq('id', example.location_id as string)
    .single()

  if (locErr || !location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }
  if ((location.owner_id as string) !== ownerId) {
    // Treat as not-found rather than 403 so owners can't probe for
    // example ids belonging to other accounts.
    return NextResponse.json({ error: 'Example not found' }, { status: 404 })
  }

  // ── Rate limit ─────────────────────────────────────────────────────────────
  // Cap regenerations per calibration_session per hour. Counts rows in
  // calibration_examples for this session created in the last 60 minutes.
  // Same shape as the calibrate POST's rate limit (which counts sessions
  // not examples) — different unit, identical pattern.
  const windowStartIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count: recentRegens, error: rateErr } = await supabase
    .from('calibration_examples')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', example.session_id as string)
    .gte('created_at', windowStartIso)

  if (rateErr) {
    console.error('regenerate POST: rate-limit count failed:', rateErr.message)
    return NextResponse.json({ error: 'Failed to check rate limit' }, { status: 500 })
  }
  if ((recentRegens ?? 0) >= REGENERATE_RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many regenerations. Please wait a few minutes before trying again.' },
      { status: 429 },
    )
  }

  // ── Regenerate ─────────────────────────────────────────────────────────────
  // Reuses the helper from src/services/calibration.ts so this endpoint
  // and the PATCH path can never drift on prompt build, allowlist
  // validation, or insert shape.
  let newExample
  try {
    newExample = await regenerateExample(
      supabase,
      example.location_id as string,
      location.google_location_id as string,
      example.session_id as string,
      example.scenario_type as ScenarioType,
      // No owner feedback — this is a brand-voice-update regen, not a
      // reject-with-feedback regen. The fresh brand_voices row IS the
      // signal driving the new output.
      undefined,
    )
  } catch (err) {
    console.error('regenerate POST: regenerateExample threw:', err)
    return NextResponse.json(
      { error: 'Failed to regenerate example. Please try again.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ example: newExample })
}
