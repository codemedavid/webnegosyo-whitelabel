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

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { BranchStockSummary } from '@/lib/inventory/branch-stock-summary'

interface BranchStockPanelProps {
  summary: BranchStockSummary
  /** Abbreviation of the ingredient's stock unit, e.g. "g". */
  unitLabel: string
  /**
   * Where a transfer is composed. Optional: a caller with no tenant slug to
   * hand still gets a working panel, it just names the direction without
   * offering the way to act on it.
   */
  transfersHref?: string
  /**
   * The store-wide threshold, shown as what a branch inherits until it chooses
   * its own. Without it a branch on zero reads as "never warn me" rather than
   * "warned at the store's number".
   */
  storeReorderLevel?: number
  /**
   * Save one branch's own threshold. Absent means read-only — the panel then
   * shows the numbers and offers no input, because a control that silently does
   * nothing is worse than no control.
   */
  onSetReorderLevel?: (outletId: string, reorderLevel: number) => void
}

/** Matches `inventory-table.ts` — NUMERIC(16,4) without a trailing zero parade. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

export function BranchStockPanel({
  summary,
  unitLabel,
  transfersHref,
  storeReorderLevel,
  onSetReorderLevel,
}: BranchStockPanelProps) {
  // Keyed by branch, so typing into one row cannot disturb another's figure.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

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
              <span className="flex items-center gap-2">
                <span
                  className={
                    isEmpty ? 'text-destructive font-medium tabular-nums' : 'tabular-nums'
                  }
                >
                  {formatQuantity(line.quantity)} {unitLabel}
                </span>

                {onSetReorderLevel && (
                  <>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`${line.name} reorder level`}
                      className="h-7 w-20 rounded border bg-background px-2 text-right tabular-nums"
                      value={drafts[line.outletId] ?? String(line.reorderLevel)}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [line.outletId]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => {
                        const typed = Number(drafts[line.outletId] ?? line.reorderLevel)
                        // A blank or nonsense box must not silently write zero,
                        // which would read as a configured "never warn me".
                        if (!Number.isFinite(typed) || typed < 0) return
                        onSetReorderLevel(line.outletId, typed)
                      }}
                    >
                      Save {line.name}
                    </button>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {/*
        What a branch on zero actually means. Without this the number reads as
        "never warn me" rather than "warned at the store's threshold", which is
        the opposite of the truth and the one misreading that would leave a shop
        silently unwatched.
      */}
      {storeReorderLevel !== undefined && lines.some((line) => line.reorderLevel <= 0) && (
        <p className="mt-2 text-muted-foreground">
          Branches showing 0 use the store level of {formatQuantity(storeReorderLevel)} {unitLabel}
        </p>
      )}

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
          {/*
            Only alongside a suggestion. When every branch is out there is
            nothing to move — that is a purchasing problem — and a link would
            send the owner to a screen that cannot help them.
          */}
          {transfersHref && (
            <Link href={transfersHref} className="font-medium text-primary underline">
              Transfer
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
