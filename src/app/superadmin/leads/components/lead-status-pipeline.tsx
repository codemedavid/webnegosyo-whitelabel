import { GitBranch } from 'lucide-react'
import type { LeadStatus } from '@/lib/leads/types'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'

interface PipelineSegment {
  status: LeadStatus
  label: string
  bar: string
  dot: string
  accent: string
  ring: string
  glow: string
}

const PIPELINE_SEGMENTS: PipelineSegment[] = [
  { status: 'new', label: 'New', bar: 'bg-sky-400', dot: 'bg-sky-400', accent: 'text-sky-400', ring: 'group-hover:border-sky-400/30', glow: 'bg-sky-400/40' },
  { status: 'contacted', label: 'Contacted', bar: 'bg-amber-400', dot: 'bg-amber-400', accent: 'text-amber-400', ring: 'group-hover:border-amber-400/30', glow: 'bg-amber-400/40' },
  { status: 'qualified', label: 'Qualified', bar: 'bg-violet-400', dot: 'bg-violet-400', accent: 'text-violet-400', ring: 'group-hover:border-violet-400/30', glow: 'bg-violet-400/40' },
  { status: 'converted', label: 'Converted', bar: 'bg-emerald-400', dot: 'bg-emerald-400', accent: 'text-emerald-400', ring: 'group-hover:border-emerald-400/30', glow: 'bg-emerald-400/40' },
  { status: 'lost', label: 'Lost', bar: 'bg-white/40', dot: 'bg-white/40', accent: 'text-white/45', ring: 'group-hover:border-white/20', glow: 'bg-white/30' },
]

interface LeadStatusPipelineProps {
  statusBreakdown: Record<LeadStatus, number>
}

export function LeadStatusPipeline({ statusBreakdown }: LeadStatusPipelineProps) {
  const total = Object.values(statusBreakdown).reduce((sum, n) => sum + n, 0)
  const converted = statusBreakdown.converted
  const winRate = total > 0 ? Math.round((converted / total) * 100) : 0

  return (
    <Panel>
      <SectionHeader
        icon={GitBranch}
        title="Pipeline"
        subtitle="Distribution of leads across every stage"
        action={
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-400">{winRate}%</span>
            <span className="text-xs uppercase tracking-wide text-white/45">win rate</span>
          </div>
        }
      />

      {/* Segmented progress bar */}
      <div className="mt-6">
        {total > 0 ? (
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {PIPELINE_SEGMENTS.map((seg) => {
              const count = statusBreakdown[seg.status]
              if (count === 0) return null
              return (
                <div
                  key={seg.status}
                  className={seg.bar}
                  style={{ flex: count }}
                  title={`${seg.label}: ${count}`}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-2.5 rounded-full bg-white/[0.06]" />
        )}
      </div>

      {/* Stage cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PIPELINE_SEGMENTS.map((seg) => {
          const count = statusBreakdown[seg.status]
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div
              key={seg.status}
              className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04] ${seg.ring}`}
            >
              <div
                className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl opacity-0 transition-opacity group-hover:opacity-100 ${seg.glow}`}
                aria-hidden
              />
              <div className="relative flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${seg.dot}`} />
                <span className="text-xs font-medium uppercase tracking-wide text-white/55">{seg.label}</span>
              </div>
              <div className="relative mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-white tabular-nums">
                  {formatNumber(count)}
                </span>
                <span className={`text-xs font-semibold ${seg.accent}`}>{pct}%</span>
              </div>
              <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${seg.bar}`}
                  style={{ width: `${total > 0 ? Math.max(count > 0 ? 4 : 0, pct) : 0}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
