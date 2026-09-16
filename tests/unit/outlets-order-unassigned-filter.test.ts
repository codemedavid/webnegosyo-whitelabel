/**
 * Orders that belong to no branch have to be reachable.
 *
 * A multi-branch merchant's order list can attribute an order to a branch or to
 * nothing at all — an order placed before the branches existed, one whose
 * customer never passed the chooser, or one written by a path that does not
 * carry the branch. Those orders are real sales, and until now the only way to
 * look at them was to look at every order at once: the branch filter offered
 * "All Branches" and each branch, and every branch option hides them.
 *
 * So the merchant could see per-branch totals and a grand total, and had no way
 * to ask the one question that explains the gap between them.
 */

import {
  OUTLET_FILTER_ALL,
  OUTLET_FILTER_UNASSIGNED,
  hasUnattributedOrders,
  listOrderOutlets,
  matchesOutletFilter,
  type OutletOrderLike,
} from '@/lib/outlets/order-outlet-display'

const branchOrder = (id: string, name: string): OutletOrderLike =>
  ({ outlet_id: id, customer_data: { outlet_id: id, outlet_name: name } }) as unknown as OutletOrderLike

const unassignedOrder = (): OutletOrderLike => ({ customer_data: {} }) as unknown as OutletOrderLike

const MONCADA = branchOrder('o-moncada', 'Moncada')
const CABANATUAN = branchOrder('o-cabanatuan', 'Cabanatuan')
const ORPHAN = unassignedOrder()

describe('the unassigned branch filter', () => {
  it('selects only the orders that name no branch', () => {
    // Arrange
    const orders = [MONCADA, ORPHAN, CABANATUAN]

    // Act
    const matched = orders.filter((order) => matchesOutletFilter(order, OUTLET_FILTER_UNASSIGNED))

    // Assert
    expect(matched).toEqual([ORPHAN])
  })

  it('leaves the all-branches and per-branch filters as they were', () => {
    // Arrange
    const orders = [MONCADA, ORPHAN, CABANATUAN]

    // Act + Assert
    expect(orders.filter((o) => matchesOutletFilter(o, OUTLET_FILTER_ALL))).toEqual(orders)
    expect(orders.filter((o) => matchesOutletFilter(o, 'o-moncada'))).toEqual([MONCADA])
  })
})

describe('whether the unassigned option is worth offering', () => {
  it('is offered when a multi-branch merchant has an order with no branch', () => {
    // Arrange
    const orders = [MONCADA, ORPHAN]

    // Act + Assert
    expect(listOrderOutlets(orders).length).toBeGreaterThan(0)
    expect(hasUnattributedOrders(orders)).toBe(true)
  })

  it('is not offered when every order names a branch', () => {
    // Arrange + Act + Assert
    expect(hasUnattributedOrders([MONCADA, CABANATUAN])).toBe(false)
  })

  it('says nothing about a single-location merchant, whose orders are all unattributed', () => {
    // Arrange: no order carries a branch, so there is no branch dropdown at all
    // and the merchant's list must look exactly as it does today.
    const orders = [ORPHAN, unassignedOrder()]

    // Act + Assert
    expect(listOrderOutlets(orders)).toEqual([])
  })
})

it('keeps a canonical Convex branch out of the unassigned bucket', () => {
  const order = { outletId: 'north', customerData: { outlet_id: 'south' } };
  expect(matchesOutletFilter(order, 'north')).toBe(true);
  expect(matchesOutletFilter(order, OUTLET_FILTER_UNASSIGNED)).toBe(false);
});
