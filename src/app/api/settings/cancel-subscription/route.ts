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

  // If the sub is already fully canceled (period ended), nothing to do.
  // Stripe would 400 on update for a canceled sub anyway.
  if (currentStatus === 'canceled') {
    return NextResponse.json({ success: true, alreadyCanceled: true })
  }

  // Schedule cancellation at the end of the current billing period rather
  // than ending immediately. The user keeps access through their paid window;
  // Stripe will fire customer.subscription.deleted at period end which our
  // webhook handler maps to status='canceled' in Supabase. Repeat clicks are
  // idempotent on Stripe's side — setting cancel_at_period_end=true twice is
  // a no-op.
  try {
    await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true })
  } catch (err) {
    console.error('cancel-subscription: stripe.subscriptions.update failed:', err)
    return NextResponse.json({ error: 'Stripe cancellation failed' }, { status: 502 })
  }

  // Don't mirror status='canceled' to Supabase here — the sub IS still active
  // until period end. Setting it would be incorrect and would also be
  // overwritten by the customer.subscription.updated webhook (which fires
  // immediately when cancel_at_period_end flips and reports the still-current
  // status). The deletion webhook handles the final flip at period end.

  return NextResponse.json({ success: true })
}
