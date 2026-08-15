'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { StockReconciliationIssue } from '@/lib/inventory/reconciliation'

interface StockReconciliationBannerProps {
  issues: readonly StockReconciliationIssue[]
}

/**
 * What a merchant sees when the stock ledger disagrees with itself.
 *
 * A trigger keeps `inventory_items.current_qty` equal to the sum of its branch
 * rows, so any divergence means drift the merchant cannot fix from here —
 * hence "contact support" rather than a repair button. Renders nothing on a
 * healthy store, and the dismissal is per-visit only (plain state, no
 * persistence): drift that is still there tomorrow should be seen tomorrow.
 */
export function StockReconciliationBanner({ issues }: StockReconciliationBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed || issues.length === 0) return null

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Stock ledger out of sync — contact support
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 text-amber-900/60 hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-200/60 dark:hover:text-amber-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
        The store total and the per-branch figures disagree for the ingredients below. Quantities
        shown on this page may be off until this is resolved.
      </p>

      <ul className="mt-2 space-y-1 text-sm text-amber-900/80 dark:text-amber-200/80">
        {issues.map((issue) => (
          <li key={issue.itemId}>
            <span className="font-medium">{issue.name}</span> — store total {issue.rollupQty},
            branches total {issue.branchSumQty}
          </li>
        ))}
      </ul>
    </div>
  )
}
