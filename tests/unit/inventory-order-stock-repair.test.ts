import { decideOrderStockRepair } from '@/lib/inventory/order-stock-repair'

const active = {
  exists: true,
  inventoryEnabled: true,
  status: 'confirmed',
  paymentStatus: 'paid',
  capturedRevision: 0,
  currentRevision: 0,
  itemCount: 2,
  selectionEvidenceRequired: false,
  hasSelectionSnapshot: false,
}

describe('order stock incident repair guard', () => {
  it('replays only an existing active order at the captured revision', () => {
    expect(decideOrderStockRepair(active)).toEqual({ action: 'apply_sale', reason: 'eligible' })
  })

  it.each([
    [{ ...active, exists: false }, 'order_not_found'],
    [{ ...active, inventoryEnabled: false }, 'inventory_disabled'],
    [{ ...active, currentRevision: 1 }, 'revision_changed'],
    [{ ...active, itemCount: 0 }, 'no_replayable_items'],
    [{ ...active, selectionEvidenceRequired: true }, 'selection_snapshot_missing'],
    [{ ...active, status: 'cancelled' }, 'terminal_order'],
    [{ ...active, status: 'voided' }, 'terminal_order'],
    [{ ...active, paymentStatus: 'refunded' }, 'terminal_order'],
  ])('skips unsafe input: %s', (input, reason) => {
    expect(decideOrderStockRepair(input)).toEqual({ action: 'skip', reason })
  })
})
