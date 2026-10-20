import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { isAdminRequest } from '@/lib/auth'

export const runtime = 'nodejs'

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK'])

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'STRIPE_SECRET_KEY is not set.' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as {
    description?: string; amount?: number; currency?: string
    recurring?: boolean; clientName?: string; clientEmail?: string
  }

  const description = String(body.description ?? '').trim()
  const amount = Number(body.amount)
  const currency = String(body.currency ?? 'USD').toUpperCase()

  if (!description) return NextResponse.json({ ok: false, error: 'Describe what this is for.' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: 'Enter an amount above zero.' }, { status: 400 })
  }

  const unit = ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100)

  try {
    const stripe = new Stripe(secret)

    const product = await stripe.products.create({
      name: description,
      metadata: {
        created_from: 'os-payment-links',
        client_name: body.clientName ?? '',
        client_email: body.clientEmail ?? '',
      },
    })

    const price = await stripe.prices.create({
      product: product.id,
      currency: currency.toLowerCase(),
      unit_amount: unit,
      ...(body.recurring ? { recurring: { interval: 'month' as const } } : {}),
    })

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],

      billing_address_collection: 'auto',
      metadata: {
        client_name: body.clientName ?? '',
        client_email: body.clientEmail ?? '',
        description,
      },
    })

    return NextResponse.json({
      ok: true,
      url: link.url,
      id: link.id,
      amount,
      currency,
      recurring: Boolean(body.recurring),
      description,
    })
  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
