import type { CheckoutLeadStatus } from '@/types/database'

const STATUS_CONFIG: Record<CheckoutLeadStatus, { label: string; classes: string }> = {
  initiated: { label: 'Initiated', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid: { label: 'Paid', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  setup_in_progress: { label: 'Setting Up', classes: 'bg-purple-50 text-purple-700 border-purple-200' },
  live: { label: 'Live', classes: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', classes: 'bg-zinc-50 text-zinc-500 border-zinc-200' },
}

export function CheckoutLeadStatusBadge({ status }: { status: CheckoutLeadStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.initiated
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}>
      {config.label}
    </span>
  )
}
