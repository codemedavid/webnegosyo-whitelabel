import type { LeadStatus } from '@/lib/leads/types'

interface StatusConfig {
  label: string
  bg: string
  text: string
  border: string
  dot: string
}

/**
 * Semantic colour mapping shared across the leads surface. Each stage keeps a
 * meaningful accent: sky = fresh intake, amber = in conversation,
 * violet = qualified opportunity, emerald = won, neutral = lost.
 */
export const LEAD_STATUS_CONFIG: Record<LeadStatus, StatusConfig> = {
  new: { label: 'New', bg: 'bg-sky-400/10', text: 'text-sky-400', border: 'border-sky-400/20', dot: 'bg-sky-400' },
  contacted: { label: 'Contacted', bg: 'bg-amber-400/10', text: 'text-amber-400', border: 'border-amber-400/20', dot: 'bg-amber-400' },
  qualified: { label: 'Qualified', bg: 'bg-violet-400/10', text: 'text-violet-400', border: 'border-violet-400/20', dot: 'bg-violet-400' },
  converted: { label: 'Converted', bg: 'bg-emerald-400/10', text: 'text-emerald-400', border: 'border-emerald-400/20', dot: 'bg-emerald-400' },
  lost: { label: 'Lost', bg: 'bg-white/[0.06]', text: 'text-white/45', border: 'border-white/10', dot: 'bg-white/40' },
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config = LEAD_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
