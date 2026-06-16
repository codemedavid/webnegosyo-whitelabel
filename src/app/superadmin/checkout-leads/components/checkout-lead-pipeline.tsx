import { GitBranch } from 'lucide-react'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'
import type { CheckoutLeadStatus } from '@/types/database'

interface PipelineSegment {
  status: CheckoutLeadStatus
  label: string
  bar: string
  dot: string
  text: string
}

// Ordered by funnel progression (left → right). Cancelled is tracked separately.
const PIPELINE_SEGMENTS: PipelineSegment[] = [
  { status: 'initiated', label: 'Initiated', bar: 'bg-sky-400', dot: 'bg-sky-400', text: 'text-sky-400' },
  { status: 'paid', label: 'Paid', bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-400' },
  { status: 'setup_in_progress', label: 'Setting Up', bar: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-400' },
  { status: 'live', label: 'Live', bar: 'bg-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-400' },
]

const CANCELLED: PipelineSegment = {
  status: 'cancelled',
  label: 'Cancelled',
  bar: 'bg-white/25',
  dot: 'bg-white/40',
  text: 'text-white/45',
}

export function CheckoutLeadPipeline({
  statusBreakdown,
}: {
  statusBreakdown: Record<CheckoutLeadStatus, number>
}) {
  const total = Object.values(statusBreakdown).reduce((sum, n) => sum + n, 0)
  const active = total - statusBreakdown.cancelled

  // Funnel uses the largest active stage as the reference width.
  const funnelMax = PIPELINE_SEGMENTS.reduce(
    (m, seg) => Math.max(m, statusBreakdown[seg.status]),
    0,
  )

  return (
    <Panel padding="p-6">
      <SectionHeader
        icon={GitBranch}
        title="Conversion funnel"
        subtitle="How leads progress from checkout to a live menu"
        action={
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
            {formatNumber(total)} total
          </span>
        }
      />

      {/* Stacked share bar */}
      <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {[...PIPELINE_SEGMENTS, CANCELLED].map((seg) => {
          const count = statusBreakdown[seg.status]
          if (count === 0) return null
          return <div key={seg.status} className={seg.bar} style={{ flex: count }} />
        })}
        {total === 0 && <div className="flex-1 bg-white/[0.06]" />}
      </div>

      {/* Funnel rows */}
      <div className="mt-6 space-y-2.5">
        {PIPELINE_SEGMENTS.map((seg) => {
          const count = statusBreakdown[seg.status]
          const share = active > 0 ? Math.round((count / active) * 100) : 0
          const width = funnelMax > 0 ? Math.max(2, (count / funnelMax) * 100) : 2
          return (
            <div
              key={seg.status}
              className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div
                className={`absolute inset-y-0 left-0 ${seg.bar} opacity-[0.12]`}
                style={{ width: `${width}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-sm">
                  <span className={`h-2 w-2 rounded-full ${seg.dot}`} />
                  <span className="font-medium text-white">{seg.label}</span>
                </span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-base font-semibold text-white">{formatNumber(count)}</span>
                  <span className="w-10 text-right text-xs text-white/40">{share}%</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cancelled summary footer */}
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs">
        <span className="flex items-center gap-2 text-white/45">
          <span className={`h-2 w-2 rounded-full ${CANCELLED.dot}`} />
          Cancelled (excluded from funnel)
        </span>
        <span className="font-medium tabular-nums text-white/55">
          {formatNumber(statusBreakdown.cancelled)}
        </span>
      </div>
    </Panel>
  )
}
