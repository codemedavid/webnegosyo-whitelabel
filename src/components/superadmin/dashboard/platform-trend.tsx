import Link from 'next/link'
import { ArrowUpRight, LineChart } from 'lucide-react'
import { Panel, SectionHeader, EmptyState } from '@/components/superadmin/ui/primitives'
import { TrendAreaChart, type TrendDatum } from '@/components/superadmin/analytics/charts'
import { formatCurrency, formatNumber } from '@/components/superadmin/ui/format'

/**
 * All-time platform revenue trend (monthly buckets).
 *
 * Defaults to the all-time series because recent windows are near-empty at
 * current production scale — a 7d/30d view would render a flat, empty chart.
 */
export function PlatformTrend({
  data,
  totalGmv,
  totalOrders,
}: {
  data: TrendDatum[]
  totalGmv: number
  totalOrders: number
}) {
  return (
    <Panel className="flex h-full flex-col">
      <SectionHeader
        icon={LineChart}
        title="Platform revenue"
        subtitle="Monthly GMV across all restaurants, all-time"
        action={
          <Link
            href="/superadmin/analytics"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
          >
            Open analytics
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />

      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/45">Lifetime GMV</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">{formatCurrency(totalGmv)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/45">Lifetime orders</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">{formatNumber(totalOrders)}</p>
        </div>
      </div>

      <div className="mt-4 flex-1">
        {data.length === 0 ? (
          <EmptyState icon={LineChart} title="No revenue yet" description="Trends appear once orders come in" />
        ) : (
          <TrendAreaChart data={data} metric="revenue" height={280} />
        )}
      </div>
    </Panel>
  )
}
