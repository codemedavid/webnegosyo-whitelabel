/**
 * Store activity: which stores took orders in a window, and how many.
 *
 * Reads both order backends — the shared platform database and each Convex
 * store's own deployment — so a store counts wherever its orders live.
 */

import { Activity, Receipt, ShoppingCart, Store, WifiOff } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { KpiCard, PageHeader } from '@/components/superadmin/ui/primitives'
import { formatCurrency, formatNumber } from '@/components/superadmin/ui/format'
import { ActivityRangePicker } from '@/components/superadmin/activity/activity-range-picker'
import { ActivityTable } from '@/components/superadmin/activity/activity-table'
import { resolveActivityWindow, type ActivityWindow } from '@/lib/activity/activity-window'
import { getTenantActivity } from '@/lib/activity/tenant-activity-server'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

export const dynamic = 'force-dynamic'

const BASE_PATH = '/superadmin/activity'

function firstValue(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

function formatDayKey(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function describeWindow(window: ActivityWindow): string {
  const days = `${window.dayCount} ${window.dayCount === 1 ? 'day' : 'days'}`
  if (window.fromDayKey === window.toDayKey) return `${formatDayKey(window.toDayKey)} · ${days}`
  return `${formatDayKey(window.fromDayKey)} – ${formatDayKey(window.toDayKey)} · ${days}`
}

interface ActivityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const params = await searchParams
  const nowIso = new Date().toISOString()
  const window = resolveActivityWindow(
    {
      range: firstValue(params.range),
      from: firstValue(params.from),
      to: firstValue(params.to),
    },
    nowIso
  )

  const report = await getTenantActivity({
    startMs: window.startMs,
    endMs: window.endMs,
  })
  const { summary } = report

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: '/superadmin' }, { label: 'Store activity' }]}
      />
      <PageHeader
        eyebrow="Operations"
        title="Store activity"
        subtitle={`Which stores took orders, and how many. ${describeWindow(window)} (Manila time).`}
      />

      <ActivityRangePicker
        basePath={BASE_PATH}
        window={window}
        maxDayKey={toBusinessDayKey(nowIso)}
      />

      {report.platformError && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          Platform orders could not be read, so platform stores show as unreachable.{' '}
          {report.platformError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active stores"
          value={formatNumber(summary.activeStores)}
          icon={Store}
          hint={`of ${formatNumber(summary.totalStores)} stores took at least one order`}
        />
        <KpiCard
          label="Orders"
          value={formatNumber(summary.totalOrders)}
          icon={ShoppingCart}
          hint={`${formatNumber(summary.cancelled)} cancelled, not counted`}
        />
        <KpiCard
          label="Revenue"
          value={formatCurrency(summary.totalRevenue)}
          icon={Receipt}
          hint="Non-cancelled orders"
        />
        <KpiCard
          label="Orders per active store"
          value={formatNumber(Math.round(summary.avgOrdersPerActiveStore))}
          icon={Activity}
          hint={`≈ ${formatNumber(
            Math.round(summary.avgOrdersPerActiveStore / Math.max(1, window.dayCount))
          )} a day`}
        />
      </div>

      {summary.unreachableStores > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          {summary.unreachableStores} {summary.unreachableStores === 1 ? 'store' : 'stores'} could
          not be read (Convex deployment down, disabled, or missing its deploy key). They are left
          out of the totals, not counted as zero — tick “Include stores with no orders” to see them.
        </p>
      )}

      <ActivityTable rows={report.rows} nowIso={report.generatedAt} />

      <p className="text-xs text-white/35">
        Read{' '}
        {new Date(report.generatedAt).toLocaleTimeString('en-PH', {
          timeZone: 'Asia/Manila',
          timeStyle: 'short',
        })}{' '}
        · refreshed at most every 2 minutes.
      </p>
    </div>
  )
}
