import { NextRequest, NextResponse } from 'next/server'
import { detectSpam, SPAM_REJECTION } from '@/lib/anti-spam'
import { SPAM_TAG, leadVerdict } from '@/lib/apply-guard'
import { funnelIdFromPath, recordFunnelLead } from '@/lib/funnel-log'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))

  if (detectSpam(b).spam) {
    return NextResponse.json(SPAM_REJECTION.body, { status: SPAM_REJECTION.status })
  }

  const { name, email, whatsapp, company, website, social, role, companySize, goal, score, source, tags, notes: extraNotes, location, currentState, desiredOutcome, budget, visitorId, pageUrl, referrer, countedByCaller } = b
  if (!name && !email && !whatsapp) return NextResponse.json({ error: 'missing contact' }, { status: 400 })

  const verdict = leadVerdict({ name, business: company, email }, b)
  const taggedByCaller = Array.isArray(tags) && tags.includes(SPAM_TAG)
  const isSpam = taggedByCaller || verdict.level === 'spam'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ ok: true, skipped: 'no supabase' })

  const now = new Date().toISOString()
  const summaryParts = [
    source ? `Source: ${source}` : null,
    score ? `AI Score: ${score}` : null,
    companySize ? `Size: ${companySize}` : null,
    goal ? `Goal: ${goal}` : null,
  ].filter(Boolean)
  const activity = [{ id: 'a' + uid(), ts: now, type: 'note', text: 'New inbound lead, ' + (summaryParts.join(' · ') || 'via website') }]

  const row = {
    id: 'lead-' + uid(),
    lead_id: null,
    client_name: name || 'Unknown',
    client_email: email || '',
    client_company: company || null,
    stage: 'lead',
    value: 0,
    currency: 'USD',
    service: goal || null,
    notes: [website ? `Website: ${website}` : null, social ? `Social: ${social}` : null, role ? `Role: ${role}` : null, extraNotes || null].filter(Boolean).join('\n') || null,
    created_at: now,
    updated_at: now,
    client_phone: whatsapp || null,
    client_website: website || null,
    client_role: role || null,
    location: location || null,
    instagram: social || null,
    priority: null,
    next_step: 'Follow up, new lead',
    next_step_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    current_state: currentState || null,
    desired_outcome: desiredOutcome || goal || null,
    goals: null,
    blockers: null,
    budget: budget || null,
    activity,
    tags: (() => {
      const base = Array.isArray(tags) ? [...tags] : (source && source.includes('scan') ? ['AI Scan'] : [])
      if (isSpam && !base.includes(SPAM_TAG)) base.push(SPAM_TAG)
      return base
    })(),
    revenue_type: null,
    retainer_months: null,
    close_date: null,
    organization: company || null,
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, key)

    let existingId: string | null = null
    if (email) {
      const r = await sb.from('deals').select('id').eq('client_email', email).limit(1)
      existingId = r.data?.[0]?.id ?? null
    }
    if (!existingId && whatsapp) {
      const r = await sb.from('deals').select('id').eq('client_phone', whatsapp).limit(1)
      existingId = r.data?.[0]?.id ?? null
    }

    if (existingId) {
      const { error } = await sb.from('deals').update({
        client_name: row.client_name, client_company: row.client_company, client_phone: row.client_phone,
        client_website: row.client_website, client_role: row.client_role, instagram: row.instagram,
        service: row.service, notes: row.notes, desired_outcome: row.desired_outcome,
        current_state: row.current_state, location: row.location, budget: row.budget,
        organization: row.organization, tags: row.tags, next_step: row.next_step,
        next_step_date: row.next_step_date, updated_at: now,
      }).eq('id', existingId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
      return NextResponse.json({ ok: true, id: existingId, updated: true })
    }

    const { error } = await sb.from('deals').insert(row)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    if (!isSpam && !countedByCaller) {
      await recordFunnelLead({
        funnelId: funnelIdFromPath(pageUrl || req.headers.get('referer'), source),
        visitorId, path: pageUrl, referrer,
      })
    }
    return NextResponse.json({ ok: true, id: row.id })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 })
  }
}
