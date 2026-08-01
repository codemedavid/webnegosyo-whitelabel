'use client'

import { AlertCircle, Crown, DoorOpen, Store, Wallet } from 'lucide-react'
import { formatPeso } from '@/lib/outlets/branch-format'
import type { BranchRoster } from '@/lib/outlets/branch-roster'
import type { Outlet } from '@/types/database'

interface BranchSummaryStripProps {
  roster: BranchRoster<Outlet>
}

interface StatProps {
  testId: string
  label: string
  value: string
  icon: React.ReactNode
  hint?: string
}

function Stat({ testId, label, value, icon, hint }: StatProps) {
  return (
    <div data-testid={testId} className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * The store-level read above the grid.
 *
 * Deliberately four figures, not ten. This strip exists so the owner knows
 * whether to keep reading; the analytics dashboard is where a number gets
 * interrogated. The revenue tile is the only one that appears conditionally —
 * a store whose takings cannot be split by branch is told that plainly rather
 * than shown a tile reading `₱0`.
 */
export function BranchSummaryStrip({ roster }: BranchSummaryStripProps) {
  const { summary, hasMetrics, unassignedMetrics } = roster

  return (
    <div className="space-y-2">
      <div className="grid divide-y rounded-xl border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <Stat
          testId="branch-summary-count"
          label="Branches"
          value={String(summary.branchCount)}
          icon={<Store className="h-4 w-4" />}
          hint={summary.staffCount === 0 ? 'No staff assigned' : `${summary.staffCount} staff total`}
        />
        <Stat
          testId="branch-summary-open"
          label="Open to customers"
          value={String(summary.activeCount)}
          icon={<DoorOpen className="h-4 w-4" />}
          hint={
            summary.activeCount === summary.branchCount
              ? 'All branches visible'
              : `${summary.branchCount - summary.activeCount} hidden`
          }
        />
        {hasMetrics && (
          <Stat
            testId="branch-summary-revenue"
            label="Store revenue"
            value={formatPeso(summary.totalRevenue)}
            icon={<Wallet className="h-4 w-4" />}
            hint={`${summary.totalOrders} orders, cancellations excluded`}
          />
        )}
        <Stat
          testId="branch-summary-top"
          label="Top branch"
          value={summary.topBranchName ?? '—'}
          icon={<Crown className="h-4 w-4" />}
          hint={summary.topBranchName ? 'By revenue' : 'No sales yet'}
        />
      </div>

      {unassignedMetrics && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {formatPeso(unassignedMetrics.revenue)} across {unassignedMetrics.orderCount} orders is
            not attributed to any branch — usually orders taken before you added branches.
          </span>
        </p>
      )}
    </div>
  )
}
