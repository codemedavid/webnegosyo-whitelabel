import type { LeadStatus } from '@/lib/leads/types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: 'NEW', className: 'bg-blue-500/15 text-blue-500' },
  contacted: { label: 'CONTACTED', className: 'bg-amber-500/15 text-amber-500' },
  qualified: { label: 'QUALIFIED', className: 'bg-purple-500/15 text-purple-500' },
  converted: { label: 'CONVERTED', className: 'bg-green-500/15 text-green-500' },
  lost: { label: 'LOST', className: 'bg-zinc-500/15 text-zinc-400' },
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  )
}
