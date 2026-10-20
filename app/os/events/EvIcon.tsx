import {
  AlertCircle, Archive, ArrowLeft, History, BarChart3, Calendar, CalendarPlus, CalendarDays, Check, Clock, Copy, CopyPlus,
  Banknote, ExternalLink, Eye, Info, LayoutDashboard, Link2, List, Loader2, Mail, MapPin, Mic, MoreHorizontal,
  Plus, RefreshCw, Settings, Sparkles, Ticket, Trash2, UserCheck, Users, Video, Globe, Share2, Trophy, MessageCircle, Megaphone, type LucideIcon,
} from 'lucide-react'

const MAP: Record<string, LucideIcon> = {
  'ti-alert-circle': AlertCircle, 'ti-archive': Archive, 'ti-arrow-left': ArrowLeft, 'ti-history': History, 'ti-chart-bar': BarChart3,
  'ti-calendar': Calendar, 'ti-calendar-plus': CalendarPlus, 'ti-calendar-event': CalendarDays, 'ti-check': Check,
  'ti-clock': Clock, 'ti-copy': Copy, 'ti-copy-plus': CopyPlus, 'ti-cash': Banknote, 'ti-external-link': ExternalLink,
  'ti-eye': Eye, 'ti-info-circle': Info, 'ti-layout-dashboard': LayoutDashboard, 'ti-link': Link2, 'ti-list': List,
  'ti-loader-2': Loader2, 'ti-mail': Mail, 'ti-map-pin': MapPin, 'ti-microphone': Mic, 'ti-dots': MoreHorizontal,
  'ti-plus': Plus, 'ti-sparkles': Sparkles, 'ti-refresh': RefreshCw, 'ti-settings': Settings, 'ti-ticket': Ticket, 'ti-trash': Trash2,
  'ti-user-check': UserCheck, 'ti-users': Users, 'ti-video': Video, 'ti-world': Globe,
  'ti-share': Share2, 'ti-trophy': Trophy, 'ti-brand-whatsapp': MessageCircle, 'ti-speakerphone': Megaphone,
}

export default function EvIcon({ name, size = 16 }: { name: string; size?: number }) {
  const I = MAP[name]
  if (!I) return <i className={`ti ${name}`} aria-hidden />
  return <I size={size} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
}
