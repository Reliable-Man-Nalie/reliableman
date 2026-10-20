'use client'

import { BRAND } from '@/lib/brand'
import { useState, useEffect } from 'react'
import ThemeToggle, { THEME_BOOT_SCRIPT } from './ThemeToggle'
import { PRIVACY_BOOT_SCRIPT } from '@/components/os/PrivacyToggle'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { hydrateFromSupabase, getProposals, getInvoices } from '@/lib/crm-store'
import { getPeople } from '@/lib/people'
import ContactCard from '@/components/ContactCard'
import SyncBanner from './SyncBanner'
import ConfirmHost from './ConfirmHost'
import QuickTasks from './QuickTasks'
import { registerContactPanel, type ContactPanelPayload } from '@/lib/contact-panel'
import './os.css'
import { OsIcon, type OsIconName } from './os-icons'

type NavItem = {
  href: string
  icon: OsIconName
  label: string
  badgeKey?: 'contacts' | 'proposals' | 'invoices'
  badgeBg?: string
  badgeColor?: string
}
type NavGroup = { id: string; title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    title: '',
    items: [
      { href: '/os', icon: 'dashboard', label: 'Dashboard' },
      { href: '/os/tasks', icon: 'tasks', label: 'Tasks' },
    ],
  },
  {
    id: 'paid',
    title: 'Get paid',
    items: [
      { href: '/os/proposals', icon: 'proposals', label: 'Proposals', badgeKey: 'proposals', badgeBg: 'rgba(232,165,22,.16)', badgeColor: 'var(--os-warn)' },
      { href: '/os/invoices',  icon: 'invoices', label: 'Invoices', badgeKey: 'invoices', badgeBg: 'rgba(220,38,38,.12)', badgeColor: 'var(--os-bad)' },
      { href: '/os/transactions', icon: 'transactions', label: 'Payments' },
      { href: '/os/finance',   icon: 'finance', label: 'Finance' },
      { href: '/os/payments',  icon: 'payments', label: 'Payment links' },
    ],
  },
  {
    id: 'sales',
    title: 'Sales',
    items: [
      { href: '/os/deals',    icon: 'leads', label: 'Leads' },
      { href: '/os/contacts', icon: 'contacts', label: 'Contacts', badgeKey: 'contacts', badgeBg: 'rgba(124,77,214,.14)', badgeColor: 'var(--os-accent)' },
      { href: '/os/companies', icon: 'companies', label: 'Companies' },
      { href: '/os/offers',   icon: 'offers', label: 'Offers' },
      { href: '/os/events',   icon: 'events', label: 'Events' },
      { href: '/os/forms',    icon: 'forms', label: 'Forms' },
    ],
  },
  {
    id: 'clients',
    title: 'Clients',
    items: [
      { href: '/os/projects', icon: 'projects', label: 'Projects' },
      { href: '/os/clients',  icon: 'clients', label: 'Active Clients' },
    ],
  },
]

const DEFAULT_OPEN = ['paid', 'sales']

const TAB_BAR: NavItem[] = [
  { href: '/os',          icon: 'dashboard', label: 'Home' },
  { href: '/os/tasks',    icon: 'tasks', label: 'Tasks' },
  { href: '/os/deals',    icon: 'leads', label: 'Leads' },
  { href: '/os/invoices', icon: 'money', label: 'Get paid', badgeKey: 'invoices' },
]

const PARTNER_TAB_BAR: NavItem[] = [
  { href: '/os/projects', icon: 'projects', label: 'Projects' },
  { href: '/os/tasks',    icon: 'tasks', label: 'Tasks' },
]

type Counts = { contacts: number; proposals: number; invoices: number }

function computeCounts(): Counts {
  try {

    const contacts = getPeople().length
    const proposals = getProposals().filter(p => p.status === 'sent').length
    const invoices = getInvoices().filter(i => i.status === 'overdue').length
    return { contacts, proposals, invoices }
  } catch {
    return { contacts: 0, proposals: 0, invoices: 0 }
  }
}

function Sidebar({ collapsed, onToggle, onClose, counts, openGroups, onToggleGroup, who }: { collapsed: boolean; onToggle: () => void; onClose?: () => void; counts: Counts; openGroups: string[]; onToggleGroup: (id: string) => void; who: { label: string; sub: string; staff: boolean; editor?: boolean; partner?: boolean } | null }) {
  const path = usePathname()

  return (
    <aside className={`os-sidebar${collapsed ? ' os-sidebar-collapsed' : ''}`}>
      {onClose ? (
        <div className="os-logo os-sheet-head">
          <div className="os-logo-text">
            <div className="os-logo-name">Menu</div>
          </div>
          <button className="os-sidebar-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>
      ) : (
        <div className="os-logo">
          {!collapsed && (
            <>
              <div className="os-logo-icon">
                <Image src="/icon.png" alt={BRAND.name} width={26} height={26} priority style={{ objectFit: 'contain' }} />
              </div>
              <div className="os-logo-text">
                <div className="os-logo-name">{BRAND.name}</div>
                <div className="os-logo-badge">Command Center</div>
              </div>
            </>
          )}
          <button
            className="os-collapse-btn"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
      )}

      <nav className="os-nav">
        {(who?.editor
          ? NAV_GROUPS
              .map(g => ({ ...g, items: g.items.filter(i => i.href.startsWith('/os/content')) }))
              .filter(g => g.items.length)
          : who?.partner
          ? NAV_GROUPS
              .map(g => ({ ...g, items: g.items.filter(i => i.href.startsWith('/os/projects') || i.href.startsWith('/os/tasks')) }))
              .filter(g => g.items.length)
          : NAV_GROUPS
        ).map((group, gi) => {
          const hasActive = group.items.some(i => (i.href === '/os' ? path === '/os' : path.startsWith(i.href)))

          const open = collapsed || !group.title || openGroups.includes(group.id) || hasActive
          return (
          <div key={group.id} className="os-nav-group">
            {group.title && !collapsed && (
              <button
                type="button"
                className={`os-nav-group-toggle${open ? ' open' : ''}`}
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={open}
              >
                <span className="os-nav-group-label">{group.title}</span>
                <span className="os-nav-group-chevron" aria-hidden="true">›</span>
              </button>
            )}
            {group.title && collapsed && gi > 0 && <div className="os-nav-group-divider" />}
            {open && group.items.map(item => {
              const active = item.href === '/os' ? path === '/os' : path.startsWith(item.href)
              const badge = item.badgeKey ? counts[item.badgeKey] : 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`os-nav-item${active ? ' active' : ''}${collapsed ? ' os-nav-item-collapsed' : ''}`}
                  onClick={onClose}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="os-nav-icon"><OsIcon name={item.icon} size={17} /></span>
                  {!collapsed && <span className="os-nav-label">{item.label}</span>}
                  {!collapsed && !!badge && (
                    <span className="os-nav-badge" style={{ background: item.badgeBg, color: item.badgeColor }}>
                      {badge}
                    </span>
                  )}
                  {collapsed && !!badge && (
                    <span className="os-nav-badge-dot" style={{ background: item.badgeColor }} />
                  )}
                </Link>
              )
            })}
          </div>
          )
        })}
      </nav>

      <div className="os-sidebar-footer">
        {!collapsed ? (
          <>
            <div className="os-agent">
              <div className="os-agent-avatar" style={who?.staff ? { background: 'linear-gradient(150deg,#0891b2,var(--os-good))' } : undefined}>{who?.staff ? 'T' : (BRAND.owner.trim()[0] || 'O').toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div className="os-agent-name">{who?.label ?? BRAND.owner}</div>
                <div className="os-agent-role">{who?.sub ?? BRAND.name}</div>
              </div>
            </div>
            <ThemeToggle variant="row" />
            <Link href="/" className="os-back-link" onClick={onClose}>
              ← Back to website
            </Link>
            <a href="/api/auth/logout" className="os-back-link" style={{ color: 'var(--os-bad)' }}>
              Sign out
            </a>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div className="os-agent-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>N</div>
            <ThemeToggle />
            <Link href="/" className="os-back-link" style={{ fontSize: 15, padding: 4 }} title="Back to website">←</Link>
          </div>
        )}
      </div>
    </aside>
  )
}

export default function OsLayout({ children }: { children: React.ReactNode }) {
  const layoutPath = usePathname()

  const isLoginGate = layoutPath === '/os/login'

  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [counts, setCounts] = useState<Counts>({ contacts: 0, proposals: 0, invoices: 0 })
  const [openGroups, setOpenGroups] = useState<string[]>(DEFAULT_OPEN)

  const [who, setWho] = useState<{ label: string; sub: string; staff: boolean; editor?: boolean; partner?: boolean; viewer?: boolean } | null>(null)

  const [panel, setPanel] = useState<ContactPanelPayload | null>(null)

  useEffect(() => registerContactPanel(setPanel), [])

  useEffect(() => {
    if (isLoginGate) return // no admin data hydration on the login screen
    hydrateFromSupabase()

    const saved = localStorage.getItem('bos_sidebar_collapsed')
    if (saved === '1') setCollapsed(true)
    const savedGroups = localStorage.getItem('bos_nav_open')
    if (savedGroups !== null) {
      try { setOpenGroups(JSON.parse(savedGroups) as string[]) } catch { /* keep defaults */ }
    }

    fetch('/api/auth/whoami')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.ok) setWho({ label: d.label, sub: d.sub, staff: d.staff, editor: d.editor, partner: d.partner, viewer: d.viewer }) })
      .catch(() => { /* sidebar just falls back to the default label */ })

    const refresh = () => setCounts(computeCounts())
    refresh()
    window.addEventListener('bos:hydrated', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('bos:hydrated', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [isLoginGate])

  function toggleGroup(id: string) {
    setOpenGroups(prev => {
      const next = prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
      localStorage.setItem('bos_nav_open', JSON.stringify(next))
      return next
    })
  }

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('bos_sidebar_collapsed', next ? '1' : '0')
  }

  if (isLoginGate) {
    return <>{children}</>
  }

  return (
    <div className="os-shell">
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: PRIVACY_BOOT_SCRIPT }} />
      <link rel="manifest" href="/os.webmanifest" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Member area" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="theme-color" content="#06040B" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <div className="os-sidebar-desktop">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapse} counts={counts} openGroups={openGroups} onToggleGroup={toggleGroup} who={who} />
      </div>

      <div className="os-mobile-topbar">
        <div className="os-mobile-logo">
          <div className="os-logo-icon os-logo-icon-sm">
            <Image src="/icon.png" alt="Logo" width={18} height={18} priority style={{ objectFit: 'contain' }} />
          </div>
          <span className="os-logo-name" style={{ fontSize: 14 }}>{BRAND.name}</span>
        </div>
        <ThemeToggle />
      </div>

      {menuOpen && (
        <>
          <div className="os-drawer-overlay" onClick={() => setMenuOpen(false)} />
          <div className="os-drawer">
            <Sidebar collapsed={false} onToggle={() => {}} onClose={() => setMenuOpen(false)} counts={counts} openGroups={openGroups} onToggleGroup={toggleGroup} who={who} />
          </div>
        </>
      )}

      <main className="os-main">
        {who?.viewer && (
          <div role="status" style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 12, border: '1px solid var(--os-line-strong)', background: 'var(--os-base-2, var(--os-card))', color: 'var(--os-text-muted)', fontSize: 13 }}>
            View only. You can look at everything here, but nothing you change is saved and nothing is sent.
          </div>
        )}
        {children}
      </main>

      <nav className="os-tabbar" aria-label="Primary">
        {(who?.partner ? PARTNER_TAB_BAR : TAB_BAR).map(tab => {
          const active = tab.href === '/os' ? layoutPath === '/os' : layoutPath.startsWith(tab.href)
          const badge = tab.badgeKey ? counts[tab.badgeKey] : 0
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`os-tab${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="os-tab-icon">
                <OsIcon name={tab.icon} size={22} strokeWidth={1.9} />
                {!!badge && <span className="os-tab-dot" />}
              </span>
              <span className="os-tab-label">{tab.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className={`os-tab os-tab-menu${menuOpen ? ' active' : ''}`}
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-label="Open menu"
        >
          <span className="os-tab-icon" aria-hidden="true"><OsIcon name="menu" size={22} strokeWidth={1.9} /></span>
          <span className="os-tab-label">Menu</span>
        </button>
      </nav>

      <ContactCard contact={panel?.contact ?? null} onClose={() => setPanel(null)} onSaveField={panel?.onSaveField} />

      <QuickTasks />

      <SyncBanner />
      <ConfirmHost />
    </div>
  )
}
