import { getOrderOutletId, getOrderOutletLabel } from '@/lib/outlets/order-outlet-display'
import { isOrderInScope } from '@/lib/outlets/branch-scope'

/**
 * The web helpers must read a Convex order too.
 *
 * The three order backends disagree about the field name. Platform Supabase has
 * a real `outlet_id` column. Tenant-owned projects carry it in `customer_data`.
 * **Convex carries it in `customerData`** — its schema (`convex/orders.ts`)
 * declares `customerData: v.optional(v.any())`, and Convex documents are
 * camelCase throughout.
 *
 * Reading only the snake_case key makes every Convex order look unattributed.
 * That does not fail loudly: a branch account would see an empty order queue on
 * a store that is taking orders normally, which reads as an outage rather than
 * as a scoping bug.
 */

const NORTH = { kind: 'branch', outletId: 'outlet-north' } as const

describe('getOrderOutletId on a Convex order', () => {
  it('reads the branch from the camelCase customerData blob', () => {
    expect(getOrderOutletId({ customerData: { outlet_id: 'outlet-north' } })).toBe('outlet-north')
  })

  it('still reads the snake_case blob used by tenant-owned projects', () => {
    expect(getOrderOutletId({ customer_data: { outlet_id: 'outlet-north' } })).toBe('outlet-north')
  })

  it('still prefers the platform column over either blob', () => {
    expect(
      getOrderOutletId({
        outlet_id: 'outlet-north',
        customerData: { outlet_id: 'outlet-south' },
      })
    ).toBe('outlet-north')
  })

  it('returns nothing for an unattributed Convex order', () => {
    expect(getOrderOutletId({ customerData: {} })).toBeNull()
  })
})

describe('getOrderOutletLabel on a Convex order', () => {
  it('reads the branch name from the camelCase blob', () => {
    expect(getOrderOutletLabel({ customerData: { outlet_name: 'North Branch' } })).toBe(
      'North Branch'
    )
  })
})

describe('isOrderInScope on a Convex order', () => {
  it('shows a branch account its own Convex order', () => {
    expect(isOrderInScope(NORTH, { customerData: { outlet_id: 'outlet-north' } })).toBe(true)
  })

  it("hides another branch's Convex order", () => {
    expect(isOrderInScope(NORTH, { customerData: { outlet_id: 'outlet-south' } })).toBe(false)
  })
})
