import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})

function buildServiceSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Permanently deletes the account: cancels Stripe subs, deletes all DB data
// in dependency order (most schemas have ON DELETE CASCADE on locations →
// auth.users, but we do it explicitly so a missing cascade somewhere doesn't
// silently leave orphan rows), deletes the Supabase auth user, clears the
// session cookie, returns { success: true }.
export async function DELETE(): Promise<NextResponse> {
  const cookieStore = await cookies()
  const ownerId = cookieStore.get('autoplier_session')?.value
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = buildServiceSupabase()

  // 1. Find every location owned by this user — we need their ids to cancel
  //    Stripe subs and to scope per-location deletes.
  const { data: locations, error: locErr } = await supabase
    .from('locations')
    .select('id')
    .eq('owner_id', ownerId)

  if (locErr) {
    console.error('delete-account: locations lookup failed:', locErr.message)
    return NextResponse.json({ error: 'Failed to load account data' }, { status: 500 })
  }

  const locationIds = (locations ?? []).map(l => l.id as string)

  // 2. Cancel Stripe subscriptions for any active rows. Best-effort — if a
  //    Stripe call fails (e.g. sub already canceled, network blip) we log
  //    and proceed with DB deletion. The user is leaving regardless.
  if (locationIds.length > 0) {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .in('location_id', locationIds)

    for (const s of subs ?? []) {
      const subId = s.stripe_subscription_id as string
      const status = s.status as string
      if (status === 'canceled' || !subId) continue
      try {
        await stripe.subscriptions.cancel(subId)
      } catch (err) {
        console.warn(`delete-account: stripe.subscriptions.cancel(${subId}) failed (continuing):`, err)
      }
    }
  }

  // 3. Delete all data in dependency order. Most have ON DELETE CASCADE on
  //    locations → auth.users, but we do it explicitly per the spec — makes
  //    the order obvious and survives a future schema change that drops a
  //    cascade. All deletes are scoped by locationIds where applicable.
  if (locationIds.length > 0) {
    const tables = [
      'oauth_tokens',
      'responses_posted',
      'calibration_examples',
      'calibration_sessions',
      'notification_preferences',
      'brand_voices',
      'subscriptions',
    ] as const

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().in('location_id', locationIds)
      if (error) {
        console.error(`delete-account: delete from ${table} failed:`, error.message)
        return NextResponse.json({ error: `Failed to delete ${table}` }, { status: 500 })
      }
    }

    const { error: locDelErr } = await supabase.from('locations').delete().eq('owner_id', ownerId)
    if (locDelErr) {
      console.error('delete-account: delete from locations failed:', locDelErr.message)
      return NextResponse.json({ error: 'Failed to delete locations' }, { status: 500 })
    }
  }

  // 4. Delete the Supabase auth user. This is the point of no return — after
  //    this, the session cookie is meaningless.
  const { error: authErr } = await supabase.auth.admin.deleteUser(ownerId)
  if (authErr) {
    console.error('delete-account: auth.admin.deleteUser failed:', authErr.message)
    return NextResponse.json({ error: 'Failed to delete auth user' }, { status: 500 })
  }

  // 5. Clear the session cookie so the client is logged out on the redirect.
  const response = NextResponse.json({ success: true })
  response.cookies.set('autoplier_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })

  return response
}
