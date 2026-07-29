'use client'

import { useMemo } from 'react'
import { compareBranches, type AnalyticsOrderLike } from '@/lib/outlets/branch-analytics'

/**
 * Branch-versus-branch takings for the owner.
 *
 * Takes the order list rather than pre-computed figures. Deriving the rows here
 * means the table cannot disagree with any total shown beside it about which
 * orders were counted — the arithmetic happens once, in `compareBranches`.
 *
 * The component renders whatever it is given: a branch-scoped account reaches
 * this through a scoped query and sees one row, its own, which is the intended
 * behaviour rather than a degraded comparison.
 */

interface BranchComparisonTableProps {
  orders: readonly AnalyticsOrderLike[]
}

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`
}

export function BranchComparisonTable({ orders }: BranchComparisonTableProps) {
  const rows = useMemo(() => compareBranches(orders), [orders])

  if (rows.length === 0) {
    return (
      <div
        data-testid="branch-comparison-empty"
        className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        No orders yet. Once your branches start taking orders, their takings appear here side by
        side.
      </div>
    )
  }

  const hasUnassigned = rows.some((row) => row.outletId === null)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Branch</th>
              <th className="px-4 py-3 text-right font-medium">Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Share</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Avg order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = row.outletId ?? 'unassigned'
              return (
                <tr key={key} className="border-t">
                  <td
                    data-testid={`branch-name-${key}`}
                    className={
                      row.outletId === null
                        ? 'px-4 py-3 text-muted-foreground'
                        : 'px-4 py-3 font-medium'
                    }
                  >
                    {row.outletName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPeso(row.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatShare(row.revenueShare)}
                  </td>
                  <td
                    data-testid={`branch-orders-${key}`}
                    className="px-4 py-3 text-right tabular-nums"
                  >
                    {row.orderCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPeso(row.averageOrderValue)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Named rather than hidden: the owner needs to know the gap exists and
          why, or the branch figures look like they are missing revenue. */}
      {hasUnassigned && (
        <p data-testid="unassigned-note" className="text-xs text-muted-foreground">
          <strong>Unassigned</strong> covers orders taken before branches were switched on, and any
          order that did not record which branch fulfilled it. They are counted in your store total.
        </p>
      )}
    </div>
  )
}
