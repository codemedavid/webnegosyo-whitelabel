'use client'

import { useEffect, useState } from 'react'
import type { InventoryItem, InventoryUnitRow, StockMovement } from '@/types/database'
import { toStockHistoryEntry, type StockHistoryEntry } from '@/lib/inventory/stock-history'
import { getStockMovementsAction } from '@/app/actions/inventory'

/**
 * The ledger, read back.
 *
 * Mounted inside the stock dialog, which Radix unmounts on close — so every
 * open is a fresh read. Caching would show a merchant their own movement
 * missing from the history it just went into.
 *
 * A failure here is deliberately quiet: history is a read, and losing it must
 * not cost the merchant the ability to record. The recording form sits outside
 * this component and stays usable.
 */

interface StockHistoryListProps {
  tenantId: string
  item: InventoryItem
  units: InventoryUnitRow[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: StockHistoryEntry[] }

/** Locale formatting happens here, on the client only — never in a server render. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const DIRECTION_CLASS = {
  in: 'text-emerald-600',
  out: 'text-red-600',
  none: 'text-muted-foreground',
} as const

export function StockHistoryList({ tenantId, item, units }: StockHistoryListProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      setState({ status: 'loading' })
      try {
        const result = await getStockMovementsAction(tenantId, item.id)
        if (!isCurrent) return
        if (!result.success) {
          setState({ status: 'error' })
          return
        }
        const context = {
          stockUnitId: item.stock_unit_id,
          unitAbbreviation: (unitId: string) =>
            units.find((u) => u.id === unitId)?.abbreviation ?? '',
        }
        setState({
          status: 'ready',
          entries: (result.data as StockMovement[]).map((movement) =>
            toStockHistoryEntry(movement, context),
          ),
        })
      } catch {
        if (isCurrent) setState({ status: 'error' })
      }
    }

    void load()
    return () => {
      isCurrent = false
    }
    // `units` is a stable page-level list; re-reading the ledger because its
    // array identity changed would double every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, item.id, item.stock_unit_id])

  if (state.status === 'loading') {
    return <p className="text-xs text-muted-foreground">Loading history…</p>
  }

  if (state.status === 'error') {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn&apos;t load the history. You can still record a movement.
      </p>
    )
  }

  if (state.entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No movements recorded yet.</p>
  }

  return (
    <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
      {state.entries.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="font-medium">
              {entry.reasonLabel}
              {entry.isAutomatic && (
                <span className="ml-1 font-normal text-muted-foreground">(automatic)</span>
              )}
            </p>
            <p className="text-muted-foreground">
              {formatTimestamp(entry.createdAt)}
              {entry.enteredLabel && ` · ${entry.enteredLabel}`}
            </p>
            {entry.note && <p className="truncate text-muted-foreground">{entry.note}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className={`font-medium ${DIRECTION_CLASS[entry.direction]}`}>
              {entry.quantityLabel}
            </p>
            <p className="text-muted-foreground">{entry.balanceLabel} left</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
