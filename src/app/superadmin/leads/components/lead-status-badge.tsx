import type { LeadStatus } from '@/lib/leads/types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; bg: string; text: string; dot: string }> = {
  new: { label: 'New', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  contacted: { label: 'Contacted', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  qualified: { label: 'Qualified', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  converted: { label: 'Converted', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  lost: { label: 'Lost', bg: 'bg-zinc-100', text: 'text-zinc-500', dot: 'bg-zinc-400' },
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
