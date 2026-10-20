import Link from 'next/link'

export type LeadsSide = 'inbound' | 'outbound' | 'intel'

export default function LeadsSwitch({ active }: { active: LeadsSide }) {
  const items: { side: LeadsSide; href: string; label: string }[] = [
    { side: 'inbound', href: '/os/deals', label: 'Inbound leads' },
    { side: 'outbound', href: '/os/outbound', label: 'Outbound leads' },
    { side: 'intel', href: '/os/outbound?tab=intel', label: 'Sales intelligence' },
  ]
  return (
    <div className="os-view-tabs" role="tablist" aria-label="Leads" style={{ marginBottom: 14, display: 'inline-flex' }}>
      {items.map(i => (
        <Link key={i.side} href={i.href} role="tab" aria-selected={active === i.side} className={`os-view-tab${active === i.side ? ' active' : ''}`}>
          {i.label}
        </Link>
      ))}
    </div>
  )
}
