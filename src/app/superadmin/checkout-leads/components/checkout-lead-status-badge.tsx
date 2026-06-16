import type { CheckoutLeadStatus } from '@/types/database'

const STATUS_CONFIG: Record<
  CheckoutLeadStatus,
  { label: string; classes: string; dot: string }
> = {
  initiated: {
    label: 'Initiated',
    classes: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
    dot: 'bg-sky-400',
  },
  paid: {
    label: 'Paid',
    classes: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    dot: 'bg-amber-400',
  },
  setup_in_progress: {
    label: 'Setting Up',
    classes: 'bg-indigo-400/10 text-indigo-400 border-indigo-400/20',
    dot: 'bg-indigo-400',
  },
  live: {
    label: 'Live',
    classes: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    dot: 'bg-emerald-400',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-white/[0.06] text-white/45 border-white/10',
    dot: 'bg-white/40',
  },
}

export function getCheckoutLeadStatusMeta(status: CheckoutLeadStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.initiated
}

export function CheckoutLeadStatusBadge({
  status,
  withDot = true,
}: {
  status: CheckoutLeadStatus
  withDot?: boolean
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.initiated
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {withDot ? <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} /> : null}
      {config.label}
    </span>
  )
}
