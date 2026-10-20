import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function rowToInvoice(r: Record<string, unknown>) {
  const g = (k: string) => r[k]
  return {
    id: g('id'), number: g('number'),
    clientName: g('client_name'), clientEmail: g('client_email'), clientCompany: g('client_company') ?? undefined,
    clientAddress: g('client_address') ?? undefined, clientPhone: g('client_phone') ?? undefined,
    projectTitle: g('project_title') ?? undefined, lineItems: g('line_items') ?? [],
    taxes: g('taxes'), amountPaid: g('amount_paid'), currency: g('currency'), status: g('status'),
    notes: g('notes') ?? undefined, issueDate: g('issue_date'), dueDate: g('due_date'),
    createdAt: g('created_at'), sentAt: g('sent_at') ?? undefined, viewedAt: g('viewed_at') ?? undefined, paidAt: g('paid_at') ?? undefined,
    proposalId: g('proposal_id') ?? undefined, phaseIndex: g('phase_index') ?? undefined,
    taxLabel: g('tax_label') ?? undefined, taxRate: g('tax_rate') ?? undefined,
    recurring: g('recurring') ?? undefined, recurringDay: g('recurring_day') ?? undefined, recurringParentId: g('recurring_parent_id') ?? undefined,

    recurringOverrides: g('recurring_overrides') ?? undefined,
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'supabase not configured' }, { status: 500 })

  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)

  const byId = await sb.from('invoices').select('*').eq('id', id).limit(1)
  if (byId.error) return NextResponse.json({ error: byId.error.message }, { status: 500 })
  if (byId.data && byId.data.length) return NextResponse.json({ invoice: rowToInvoice(byId.data[0]) })

  return NextResponse.json({ invoice: null })
}
