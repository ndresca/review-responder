import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})

// Lazily create the product + price on first call, then reuse.
// In production you'd store the price ID in an env var after creating it once.
async function getOrCreatePrice(): Promise<string> {
  // Check for existing product by metadata
  const products = await stripe.products.list({ limit: 1, active: true })
  const existing = products.data.find(p => p.metadata.app === 'autoplier')

  if (existing) {
    const prices = await stripe.prices.list({ product: existing.id, active: true, limit: 1 })
    if (prices.data.length > 0) return prices.data[0].id
  }

  const product = await stripe.products.create({
    name: 'Autoplier — Pro',
    description: 'AI-powered review responses for your restaurant. $29/month.',
    metadata: { app: 'autoplier' },
  })

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 2900, // $29.00
    currency: 'usd',
    recurring: { interval: 'month' },
  })

  return price.id
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const locationId: string | undefined = body.locationId

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    // Pin to a canonical domain when configured so success/cancel URLs match
    // the host Vercel actually serves on (and the host configured for Stripe
    // webhooks / OAuth). Without this, a user who landed on apex vs www would
    // get different redirect URLs, and the apex→www redirect can drop session
    // cookies on the way back from Checkout.
    const canonicalUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    const origin = canonicalUrl ?? new URL(request.url).origin
    const priceId = await getOrCreatePrice()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { location_id: locationId },
      },
      metadata: { location_id: locationId },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/onboarding?step=5`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 },
    )
  }
}
