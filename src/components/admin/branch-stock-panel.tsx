/**
 * One ingredient, across every shop.
 *
 * The headline figure on the inventory table is the chain roll-up, which reads
 * the same whether 700g of flour is split 350/350 or 700/0. This panel is what
 * makes that difference visible, and it is where an owner decides a transfer:
 * it names a direction — North → South — and deliberately no quantity, because
 * a suggested figure gets obeyed rather than judged and only the merchant knows
 * what they can actually carry.
 *
 * Renders NOTHING for a single-shop store. Most tenants have one shop, and a
 * panel repeating "you have one branch" on every ingredient row would be noise
 * on the majority of screens.
 */

import { AlertTriangle } from 'lucide-react'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'

interface BranchStockPanelProps {
  summary: BranchStockSummary
  /** Abbreviation of the ingredient's stock unit, e.g. "g". */
  unitLabel: string
}

/** Matches `inventory-table.ts` — NUMERIC(16,4) without a trailing zero parade. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

export function BranchStockPanel({ summary, unitLabel }: BranchStockPanelProps) {
  if (!summary.isMultiBranch) return null

  const { lines, emptyBranches, suggestion } = summary
  const emptyIds = new Set(emptyBranches.map((branch) => branch.outletId))

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <ul className="space-y-1">
        {lines.map((line) => {
          const isEmpty = emptyIds.has(line.outletId)
          return (
            <li key={line.outletId} className="flex items-center justify-between gap-3">
              <span className={isEmpty ? 'text-destructive font-medium' : ''}>{line.name}</span>
              <span
                className={
                  isEmpty ? 'text-destructive font-medium tabular-nums' : 'tabular-nums'
                }
              >
                {formatQuantity(line.quantity)} {unitLabel}
              </span>
            </li>
          )
        })}
      </ul>

      {emptyBranches.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Out of stock at {emptyBranches.map((branch) => branch.name).join(', ')}
          </span>
        </p>
      )}

      {suggestion && (
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <span>Move stock</span>
          {/*
            The arrow is a text character rather than an icon on purpose: the
            direction IS the message, so it has to survive being read aloud. An
            aria-hidden icon between two branch names would announce as
            "North South", which is the one reading that could send stock the
            wrong way.
          */}
          <span className="font-medium text-foreground">
            {suggestion.fromName} → {suggestion.toName}
          </span>
        </p>
      )}
    </div>
  )
}
