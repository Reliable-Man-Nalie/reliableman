import { NextRequest, NextResponse } from 'next/server'

function rowToProposal(r: Record<string, unknown>) {
  const g = (k: string) => r[k]
  return {
    id: g('id'), token: g('token'), dealId: g('deal_id') ?? undefined, ref: g('ref'),
    clientName: g('client_name'), clientEmail: g('client_email'), clientCompany: g('client_company') ?? undefined,
    title: g('title'), intro: g('intro'),

    services: g('services') ?? [], deliverables: g('deliverables') ?? [],
    paymentSchedule: g('payment_schedule') ?? [],
    total: g('total'), currency: g('currency'), validDays: g('valid_days'), status: g('status'),
    paymentLink: g('payment_link') ?? undefined, bankInfo: g('bank_info') ?? undefined, notes: g('notes') ?? undefined,
    createdAt: g('created_at'), sentAt: g('sent_at') ?? undefined, signedAt: g('signed_at') ?? undefined,
    signerName: g('signer_name') ?? undefined, linkedInvoiceId: g('linked_invoice_id') ?? undefined,
    billingDay: g('billing_day') ?? 1, version: g('version') ?? 1,
    parentProposalId: g('parent_proposal_id') ?? undefined,
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const id = req.nextUrl.searchParams.get('id')
  if (!token && !id) return NextResponse.json({ error: 'missing token or id' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'supabase not configured' }, { status: 500 })

  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)
  const col = token ? 'token' : 'id'
  const val = token || id
  const { data, error } = await sb.from('proposals').select('*').eq(col, val).limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || !data.length) return NextResponse.json({ proposal: null })
  return NextResponse.json({ proposal: rowToProposal(data[0]) })
}
