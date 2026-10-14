/**
 * Claim kinds (migration 20261013160000): an order EDIT and the order's own
 * life (sale / cancel / un-cancel) number their claims in separate namespaces.
 */

import {
  hasBlockingVoidClaim,
  isCancelledByClaims,
  isLatestSaleReversed,
  latestCancellationRestored,
  resolveRedepletionRevision,
  resolveVoidClaimRevision,
  type OrderStockClaimRow,
} from '@/lib/inventory/order-stock-claim'

const sale = (revision: number, kind: 'order' | 'edit' = 'order'): OrderStockClaimRow => ({ reason: 'sale', revision, kind })
const voidClaim = (revision: number, kind: 'order' | 'edit' = 'order', restored?: OrderStockClaimRow['restored']): OrderStockClaimRow =>
  ({ reason: 'void', revision, kind, restored })

describe('hasBlockingVoidClaim', () => {
  it('an edit return never blocks the original sale', () => {
    expect(hasBlockingVoidClaim([voidClaim(1, 'edit')], 0)).toBe(false)
  })

  it('a cancellation at or above the sale still blocks it (cancel wins)', () => {
    expect(hasBlockingVoidClaim([voidClaim(0)], 0)).toBe(true)
  })

  it('rows from before the kind column read as the order\'s own', () => {
    expect(hasBlockingVoidClaim([{ reason: 'void', revision: 0 }], 0)).toBe(true)
  })
})

describe('isLatestSaleReversed', () => {
  it('an edit return is not a cancellation', () => {
    expect(isLatestSaleReversed([sale(0), voidClaim(1, 'edit')])).toBe(false)
  })

  it('a cancellation at the latest sale is', () => {
    expect(isLatestSaleReversed([sale(0), sale(1, 'edit'), voidClaim(0)])).toBe(true)
  })

  it('a simple-option edit return (action void) is not a cancellation; cancel is', () => {
    expect(isLatestSaleReversed([], [{ action: 'sale', revision: 0 }, { action: 'void', revision: 1 }])).toBe(false)
    expect(isLatestSaleReversed([], [{ action: 'sale', revision: 0 }, { action: 'cancel', revision: 1 }])).toBe(true)
  })
})

describe('isCancelledByClaims', () => {
  it('is false for a live order, edited or not', () => {
    expect(isCancelledByClaims([])).toBe(false)
    expect(isCancelledByClaims([sale(0), sale(1, 'edit'), voidClaim(2, 'edit')])).toBe(false)
  })

  it('is true once a cancellation covers the latest sale, and false again after an un-cancel', () => {
    expect(isCancelledByClaims([sale(0), voidClaim(0)])).toBe(true)
    expect(isCancelledByClaims([sale(0), voidClaim(0), sale(1)])).toBe(false)
  })

  it('a cancellation that beat the sale counts', () => {
    expect(isCancelledByClaims([voidClaim(0)])).toBe(true)
  })
})

describe('revisions', () => {
  it('an un-cancel numbers above the order\'s own claims only, never colliding with edits', () => {
    expect(resolveRedepletionRevision([sale(0), voidClaim(0), sale(1, 'edit'), sale(5, 'edit')])).toBe(1)
  })

  it('a cancellation pairs with the latest own sale, ignoring edit returns', () => {
    expect(resolveVoidClaimRevision([sale(0), voidClaim(0, 'edit'), sale(3, 'edit')])).toBe(0)
  })
})

describe('latestCancellationRestored', () => {
  const row = { inventory_item_id: 'flour', outlet_id: null, quantity_delta: 200, entered_quantity: 200, entered_unit_id: 'g' }

  it('reads the newest cancellation\'s record', () => {
    expect(latestCancellationRestored([voidClaim(0, 'order', [{ ...row, quantity_delta: 1 }]), voidClaim(1, 'order', [row])])).toEqual([row])
  })

  it('is null without a record, with an empty one, or for edit returns', () => {
    expect(latestCancellationRestored([voidClaim(0)])).toBeNull()
    expect(latestCancellationRestored([voidClaim(0, 'order', [])])).toBeNull()
    expect(latestCancellationRestored([voidClaim(1, 'edit', [row])])).toBeNull()
  })
})
