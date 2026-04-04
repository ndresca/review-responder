import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { processLocation } from '@/services/auto-post'
import { sendDigest } from '@/services/digest'

// ─── Auth ────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET is not set')

  // Vercel forwards the secret as the Authorization header: "Bearer <secret>"
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}

// ─── DB ──────────────────────────────────────────────────────────────────────

type LocationRow = { id: string }

async function getAutoPostLocations(): Promise<LocationRow[]> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

  const supabase = createClient(url, key)

  const { data, error } = await supabase
    .from('brand_voices')
    .select('location_id')
    .eq('auto_post_enabled', true)

  if (error) throw new Error(`getAutoPostLocations: ${error.message}`)

  return (data ?? []).map(row => ({ id: row.location_id as string }))
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const locations = await getAutoPostLocations()
  const total = locations.length

  if (total === 0) {
    return NextResponse.json({ processed: 0, errors: 0 })
  }

  // Stagger processing across the 15-minute window so GBP API calls don't
  // hammer all at once. Locations are processed in parallel but with a delay
  // proportional to their index position.
  const windowMs = 15 * 60 * 1000
  const results = await Promise.allSettled(
    locations.map(async (location, index) => {
      const delay = (index / total) * windowMs
      await new Promise<void>(resolve => setTimeout(resolve, delay))
      await processLocation(location.id)
      // Digest checks its own schedule — no-ops if today isn't the right day/time
      await sendDigest(location.id).catch(err => {
        console.error(`sendDigest failed for ${location.id}:`, err)
      })
    }),
  )

  let processed = 0
  let errors = 0

  for (const result of results) {
    if (result.status === 'fulfilled') {
      processed++
    } else {
      errors++
      console.error('processLocation failed:', result.reason)
    }
  }

  return NextResponse.json({ processed, errors })
}
