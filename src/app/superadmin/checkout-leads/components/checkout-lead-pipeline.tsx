import type { CheckoutLeadStatus } from '@/types/database'

interface CheckoutLeadPipelineProps {
  statusBreakdown: Record<CheckoutLeadStatus, number>
}

const PIPELINE_SEGMENTS: { status: CheckoutLeadStatus; label: string; color: string }[] = [
  { status: 'initiated', label: 'Initiated', color: 'bg-blue-500' },
  { status: 'paid', label: 'Paid', color: 'bg-amber-500' },
  { status: 'setup_in_progress', label: 'Setting Up', color: 'bg-purple-500' },
  { status: 'live', label: 'Live', color: 'bg-green-500' },
  { status: 'cancelled', label: 'Cancelled', color: 'bg-zinc-300' },
]

export function CheckoutLeadPipeline({ statusBreakdown }: CheckoutLeadPipelineProps) {
  const total = Object.values(statusBreakdown).reduce((sum, n) => sum + n, 0)

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pipeline</h3>
        <span className="text-xs text-muted-foreground">{total} total</span>
      </div>

      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {PIPELINE_SEGMENTS.map((seg) => {
          const count = statusBreakdown[seg.status]
          if (count === 0) return null
          return <div key={seg.status} className={seg.color} style={{ flex: count }} />
        })}
        {total === 0 && <div className="flex-1 bg-gray-100" />}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {PIPELINE_SEGMENTS.map((seg) => (
          <div key={seg.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
            <span>{seg.label}</span>
            <span className="font-medium text-foreground">{statusBreakdown[seg.status]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
