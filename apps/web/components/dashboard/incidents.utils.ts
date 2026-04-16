import { AlertTriangle, CheckCircle2, Clock, XCircle, Pause, Eye, Zap, Bell } from 'lucide-react'

export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all'

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'all', label: 'All time' },
]

export function getPeriodRange(period: Period): { from?: string; to?: string } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()

  if (period === 'today') return { from: startOfDay(now), to: endOfDay(now) }
  if (period === 'yesterday') {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    return { from: startOfDay(y), to: endOfDay(y) }
  }
  if (period === 'week') {
    const w = new Date(now)
    w.setDate(w.getDate() - 7)
    return { from: w.toISOString() }
  }
  if (period === 'month') {
    const m = new Date(now)
    m.setDate(m.getDate() - 30)
    return { from: m.toISOString() }
  }
  return {}
}

export type StatusKey =
  | 'investigating'
  | 'brief_ready'
  | 'fixing'
  | 'resolved'
  | 'snoozed'
  | 'dismissed'
  | 'escalated'
  | 'error'

export const STATUS_CONFIG: Record<
  StatusKey,
  { label: string; badgeVariant: 'amber' | 'blue' | 'purple' | 'emerald' | 'muted' | 'red'; Icon: React.ElementType }
> = {
  investigating: { label: 'Investigating', badgeVariant: 'amber', Icon: Clock },
  brief_ready: { label: 'Brief Ready', badgeVariant: 'blue', Icon: Eye },
  fixing: { label: 'Fix in Progress', badgeVariant: 'purple', Icon: Zap },
  resolved: { label: 'Passed', badgeVariant: 'emerald', Icon: CheckCircle2 },
  snoozed: { label: 'Snoozed', badgeVariant: 'muted', Icon: Pause },
  dismissed: { label: 'Cancelled', badgeVariant: 'muted', Icon: XCircle },
  escalated: { label: 'Escalated', badgeVariant: 'red', Icon: Bell },
  error: { label: 'Failed', badgeVariant: 'red', Icon: AlertTriangle },
}

export function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ${sec % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function getStatusColor(status: StatusKey): string {
  const map: Record<StatusKey, string> = {
    investigating: '#F59E0B',
    brief_ready: '#60A5FA',
    fixing: '#A78BFA',
    resolved: '#34D399',
    snoozed: '#6B7280',
    dismissed: '#52525B',
    escalated: '#F87171',
    error: '#F87171',
  }
  return map[status] ?? '#F87171'
}
