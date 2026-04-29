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

export async function POST(request: Request): Promise<NextResponse> {
  const cookieStore = await cookies()
  const ownerId = cookieStore.get('autoplier_session')?.value
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let locationId: string
  try {
    const body = (await request.json()) as { locationId?: string }
    if (!body.locationId) return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    locationId = body.locationId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = buildServiceSupabase()

  // Verify ownership before touching anything.
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  if ((location.owner_id as string) !== ownerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find the subscription row for this location.
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('location_id', locationId)
    .single()

  if (subErr || !sub) return NextResponse.json({ error: 'No subscription found' }, { status: 404 })

  const stripeSubId = sub.stripe_subscription_id as string
  const currentStatus = sub.status as string

  // If already canceled, no-op (idempotent — handles double-clicks and retries).
  if (currentStatus === 'canceled') {
    return NextResponse.json({ success: true, alreadyCanceled: true })
  }

  // Cancel in Stripe first. If this fails we don't update the DB — the user
  // can retry. If we updated DB first and Stripe call failed, we'd have an
  // inconsistent state where billing continues but our app says canceled.
  try {
    await stripe.subscriptions.cancel(stripeSubId)
  } catch (err) {
    console.error('cancel-subscription: stripe.subscriptions.cancel failed:', err)
    return NextResponse.json({ error: 'Stripe cancellation failed' }, { status: 502 })
  }

  // Mirror to Supabase. The customer.subscription.deleted webhook will also
  // fire and run the same UPDATE — that's fine, it's idempotent.
  const { error: updateErr } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled' } as never)
    .eq('location_id', locationId)

  if (updateErr) {
    // Stripe cancellation succeeded but DB update failed — log loudly. The
    // webhook should reconcile within seconds, so we still return success.
    console.error('cancel-subscription: DB update failed (webhook should reconcile):', updateErr.message)
  }

  return NextResponse.json({ success: true })
}
