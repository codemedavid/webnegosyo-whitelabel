/**
 * Sales pipeline: a stranger fills in the order form, pays, gets a live store,
 * takes orders and pays again. Shows how many leads reach each step, how long
 * each step takes, and every lead still waiting on a person.
 */

import { Clock, Filter, Hand, Rocket } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { KpiCard, PageHeader } from '@/components/superadmin/ui/primitives'
import { formatNumber } from '@/components/superadmin/ui/format'
import { NeedsAttentionPanel } from '@/components/superadmin/pipeline/needs-attention-panel'
import { PipelineFiltersBar } from '@/components/superadmin/pipeline/pipeline-filters'
import { PipelineStages } from '@/components/superadmin/pipeline/pipeline-stages'
import { parsePipelineFilters, type PipelineFilters } from '@/lib/sales-pipeline/filters'
import { formatDuration } from '@/lib/sales-pipeline/format-duration'
import { findNeedsAttention } from '@/lib/sales-pipeline/needs-attention'
import { loadPipelineData, type PipelineData } from '@/lib/sales-pipeline/pipeline-server'
import { summarizePipeline } from '@/lib/sales-pipeline/stages'

// Operational lead data behind superadmin auth: read per request.
export const dynamic = 'force-dynamic'

interface PipelinePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function readPipeline(filters: PipelineFilters): Promise<{ data: PipelineData | null; error: string | null }> {
  try {
    return { data: await loadPipelineData(filters), error: null }
  } catch (error: unknown) {
    console.error('[superadmin/pipeline] load failed', error)
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const params = await searchParams
  const filters = parsePipelineFilters({ range: params.range, offer: params.offer })
  const { data, error } = await readPipeline(filters)

  const header = (
    <>
      <Breadcrumbs items={[{ label: 'Dashboard', href: '/superadmin' }, { label: 'Sales pipeline' }]} />
      <PageHeader
        eyebrow="Automate selling"
        title="Sales pipeline"
        subtitle="From the order form to a second month paid, and every lead still waiting on a person."
      />
      <PipelineFiltersBar filters={filters} />
    </>
  )

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          The pipeline could not be read. {error}
        </p>
      </div>
    )
  }

  const nowMs = Date.parse(data.generatedAt)
  const leads = data.leads
  const summary = summarizePipeline(leads)
  const attention = findNeedsAttention(leads, nowMs)
  const waitingCount = attention.reduce((sum, group) => sum + group.items.length, 0)
  const overdueCount = attention.reduce((sum, group) => sum + group.overdueCount, 0)
  const live = summary.stages.find((stage) => stage.key === 'live')?.count ?? 0
  const livePct = summary.total > 0 ? Math.round((live / summary.total) * 100) : 0

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Ordered" value={formatNumber(summary.total)} icon={Filter} hint="Leads in this view" />
        <KpiCard label="Live stores" value={formatNumber(live)} icon={Rocket} hint={`${livePct}% of orders`} />
        <KpiCard
          label="Order → live"
          value={formatDuration(summary.orderToLiveMedianMs)}
          icon={Clock}
          hint={`Median · paid → live ${formatDuration(summary.paidToLiveMedianMs)}`}
        />
        <KpiCard
          label="Waiting on a human"
          value={formatNumber(waitingCount)}
          icon={Hand}
          hint={overdueCount > 0 ? `${formatNumber(overdueCount)} overdue` : 'None overdue'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PipelineStages stages={summary.stages} />
        <NeedsAttentionPanel groups={attention} nowMs={nowMs} />
      </div>

      <p className="text-xs text-white/35">
        Paid and live times before 9 Oct 2026 are approximate (back-filled). First orders are read for
        platform stores only
        {data.storesWithUnreadOrders > 0
          ? `; ${formatNumber(data.storesWithUnreadOrders)} lead ${data.storesWithUnreadOrders === 1 ? 'store is' : 'stores are'} on another backend and ${data.storesWithUnreadOrders === 1 ? 'shows' : 'show'} no first order`
          : ''}
        . Read{' '}
        {new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}.
      </p>
    </div>
  )
}
