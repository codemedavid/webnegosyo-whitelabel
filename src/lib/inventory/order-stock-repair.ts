export interface OrderStockRepairState {
  exists: boolean
  inventoryEnabled: boolean
  status: string | null | undefined
  paymentStatus: string | null | undefined
  capturedRevision: number
  currentRevision: number
  itemCount: number
  selectionEvidenceRequired: boolean
  hasSelectionSnapshot: boolean
}

export type OrderStockRepairDecision =
  | { action: 'apply_sale'; reason: 'eligible' }
  | { action: 'skip'; reason: 'order_not_found' | 'inventory_disabled' | 'terminal_order' | 'revision_changed' | 'no_replayable_items' | 'selection_snapshot_missing' }

const TERMINAL = new Set(['cancelled', 'canceled', 'voided', 'refunded'])

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

/** Pure safety gate used before the incident script can call a stock writer. */
export function decideOrderStockRepair(state: OrderStockRepairState): OrderStockRepairDecision {
  if (!state.exists) return { action: 'skip', reason: 'order_not_found' }
  if (!state.inventoryEnabled) return { action: 'skip', reason: 'inventory_disabled' }
  if (TERMINAL.has(normalized(state.status)) || TERMINAL.has(normalized(state.paymentStatus))) {
    return { action: 'skip', reason: 'terminal_order' }
  }
  if (state.currentRevision !== state.capturedRevision) {
    return { action: 'skip', reason: 'revision_changed' }
  }
  if (state.selectionEvidenceRequired && !state.hasSelectionSnapshot) {
    return { action: 'skip', reason: 'selection_snapshot_missing' }
  }
  if (state.itemCount === 0) return { action: 'skip', reason: 'no_replayable_items' }
  return { action: 'apply_sale', reason: 'eligible' }
}
