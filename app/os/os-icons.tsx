'use client'
import {
  LayoutDashboard, CheckSquare, FileText, Receipt, Landmark, Link2, Users, Zap,
  Inbox, Tag, Filter, Ticket, Clapperboard, FileEdit, FolderKanban, Handshake,
  MessageSquare, CalendarDays, GraduationCap, KeyRound, Video, TrendingUp,
  Globe, Stethoscope, Menu, Flame, CircleDollarSign, CheckCircle2, Sparkles, Send,
  Radar, Repeat, Building2, type LucideIcon,
} from 'lucide-react'

export const OS_ICONS = {
  dashboard: LayoutDashboard,
  tasks: CheckSquare,
  proposals: FileText,
  invoices: Receipt,
  finance: Landmark,
  payments: Link2,
  transactions: CircleDollarSign,
  contacts: Users,
  leads: Zap,
  applications: Inbox,
  outreach: Radar,
  offers: Tag,
  funnels: Filter,
  events: Ticket,
  content: Clapperboard,
  forms: FileEdit,
  projects: FolderKanban,
  clients: Handshake,
  messages: MessageSquare,
  bookings: CalendarDays,
  programs: GraduationCap,
  access: KeyRound,
  calls: Video,
  insights: TrendingUp,
  analytics: Globe,
  systems: Stethoscope,
  menu: Menu,

  hot: Flame,
  money: CircleDollarSign,
  signed: CheckCircle2,
  assistant: Sparkles,
  salesEngine: Send,
  outbound: Repeat,
  companies: Building2,
} satisfies Record<string, LucideIcon>

export type OsIconName = keyof typeof OS_ICONS

export function OsIcon({ name, size = 16, strokeWidth = 2, className, style }: {
  name: OsIconName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties
}) {
  const Icon = OS_ICONS[name]
  return <Icon size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden focusable={false} />
}
