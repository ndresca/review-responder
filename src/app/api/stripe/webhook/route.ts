import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function buildStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is required')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const stripe = buildStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getSupabase()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const locationId = session.metadata?.location_id

      if (locationId) {
        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            location_id: locationId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: 'trialing',
            current_period_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          } as never, { onConflict: 'location_id' })

        if (error) {
          console.error('Failed to upsert subscription:', error.message)
          return NextResponse.json({ error: 'Database error' }, { status: 500 })
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription

      const update: { status?: string; current_period_end?: string } = {}

      const mapped = mapStripeStatus(sub.status)
      if (mapped) update.status = mapped

      // Stripe API 2026-03 moved current_period_end onto the subscription item.
      // Fall back to the legacy top-level field for older webhook payloads.
      const periodEndUnix =
        (sub as { current_period_end?: number }).current_period_end ??
        sub.items.data[0]?.current_period_end

      if (periodEndUnix) {
        update.current_period_end = new Date(periodEndUnix * 1000).toISOString()
      }

      if (Object.keys(update).length === 0) break

      const { error } = await supabase
        .from('subscriptions')
        .update(update as never)
        .eq('stripe_subscription_id', sub.id)

      if (error) {
        console.error('Failed to update subscription on customer.subscription.updated:', error.message)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription

      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled' } as never)
        .eq('stripe_subscription_id', sub.id)

      if (error) {
        console.error('Failed to mark subscription canceled:', error.message)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}

// Stripe's subscription.status enum is broader than our DB CHECK constraint
// (subscriptions.status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid').
// Returns null for statuses we don't store — the caller skips the field rather
// than violating the constraint and crashing the webhook.
function mapStripeStatus(
  status: Stripe.Subscription.Status,
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | null {
  switch (status) {
    case 'trialing':           return 'trialing'
    case 'active':             return 'active'
    case 'past_due':           return 'past_due'
    case 'canceled':           return 'canceled'
    case 'unpaid':             return 'unpaid'
    case 'incomplete_expired': return 'canceled'  // never-activated subs that timed out
    case 'paused':             return 'past_due'  // closest match in our enum
    case 'incomplete':         return null         // pre-payment state — don't clobber an existing record
    default:                   return null
  }
}
