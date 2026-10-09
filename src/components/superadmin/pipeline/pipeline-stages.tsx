/**
 * The nine pipeline stages as funnel rows: how many leads reached each stage,
 * what share of the stage before made it, and the typical time that step took.
 */

import { GitBranch } from 'lucide-react'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'
import { formatDuration } from '@/lib/sales-pipeline/format-duration'
import type { PipelineStageSummary } from '@/lib/sales-pipeline/stages'

function conversionText(stage: PipelineStageSummary): string {
  return stage.conversionPct === null ? '' : `${stage.conversionPct}%`
}

function StageRow({ stage, widthPct }: { stage: PipelineStageSummary; widthPct: number }) {
  const step = formatDuration(stage.medianFromPreviousMs)
  return (
    <li className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="absolute inset-y-0 left-0 bg-emerald-400 opacity-[0.12]" style={{ width: `${widthPct}%` }} />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{stage.label}</p>
          <p className="truncate text-xs text-white/45">{stage.hint}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-3 tabular-nums">
          <span className="hidden w-16 text-right text-xs text-white/40 sm:inline" title="Median time for this step">
            {stage.medianFromPreviousMs === null ? '' : `~${step}`}
          </span>
          <span className="w-10 text-right text-xs text-white/40" title="Share of the stage before">
            {conversionText(stage)}
          </span>
          <span className="w-10 text-right text-base font-semibold text-white">{formatNumber(stage.count)}</span>
        </div>
      </div>
    </li>
  )
}

export function PipelineStages({ stages }: { stages: PipelineStageSummary[] }) {
  const top = Math.max(1, ...stages.map((stage) => stage.count))
  return (
    <Panel padding="p-6">
      <SectionHeader
        icon={GitBranch}
        title="Stages"
        subtitle="Count · share of the stage before · median time for the step"
      />
      <ol className="mt-5 space-y-2">
        {stages.map((stage) => (
          <StageRow key={stage.key} stage={stage} widthPct={Math.max(2, (stage.count / top) * 100)} />
        ))}
      </ol>
    </Panel>
  )
}
