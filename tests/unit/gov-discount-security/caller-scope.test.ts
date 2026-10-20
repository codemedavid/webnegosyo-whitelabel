/**
 * Who may act on Senior/PWD routes: the feature permission and the branch an
 * account may name. Pure rules — the routes only wire them.
 */
import { describe, it, expect } from '@jest/globals'
import { callerHasFeature, resolveCallerOutlet } from '@/lib/gov-discount-ledger/caller-scope'

const NORTH = '11111111-1111-4111-8111-111111111111'
const SOUTH = '22222222-2222-4222-8222-222222222222'

const owner = { role: 'admin', tenant_id: 't', is_owner: true, permissions: [], outlet_id: NORTH }
const fullAccess = { role: 'admin', tenant_id: 't', is_owner: false, permissions: null, outlet_id: null }
const cashier = { role: 'admin', tenant_id: 't', is_owner: false, permissions: ['pos'], outlet_id: null }
const kitchen = { role: 'admin', tenant_id: 't', is_owner: false, permissions: ['kitchen'], outlet_id: null }
const northCashier = { ...cashier, outlet_id: NORTH }

describe('callerHasFeature', () => {
  it('lets owners, full-access accounts and holders of the key through', () => {
    expect(callerHasFeature(owner, 'pos')).toBe(true)
    expect(callerHasFeature(fullAccess, 'pos')).toBe(true)
    expect(callerHasFeature(cashier, 'pos')).toBe(true)
  })

  it('refuses a staff account without the key, and a missing account', () => {
    expect(callerHasFeature(kitchen, 'pos')).toBe(false)
    expect(callerHasFeature(cashier, 'discount_review')).toBe(false)
    expect(callerHasFeature(null, 'pos')).toBe(false)
  })
})

describe('resolveCallerOutlet', () => {
  const tenantOutlets = new Set([NORTH, SOUTH])

  it('confines a branch-locked account to its own branch', () => {
    expect(resolveCallerOutlet(northCashier, null, tenantOutlets)).toEqual({ ok: true, outletId: NORTH })
    expect(resolveCallerOutlet(northCashier, NORTH, tenantOutlets)).toEqual({ ok: true, outletId: NORTH })
    expect(resolveCallerOutlet(northCashier, SOUTH, tenantOutlets)).toEqual({ ok: false, status: 403 })
  })

  it('lets a store-wide account name any branch of the store, or none', () => {
    expect(resolveCallerOutlet(cashier, SOUTH, tenantOutlets)).toEqual({ ok: true, outletId: SOUTH })
    expect(resolveCallerOutlet(cashier, null, tenantOutlets)).toEqual({ ok: true, outletId: null })
    expect(resolveCallerOutlet(owner, SOUTH, tenantOutlets)).toEqual({ ok: true, outletId: SOUTH })
  })

  it("refuses a branch that is not this store's", () => {
    expect(resolveCallerOutlet(cashier, '33333333-3333-4333-8333-333333333333', tenantOutlets)).toEqual({
      ok: false,
      status: 400,
    })
  })
})
