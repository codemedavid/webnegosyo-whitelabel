/**
 * The bell's notice is worded twice: by the web push route
 * (`src/lib/push/merchant-notification-push.ts`) and by the merchant app's
 * list (`webnegosyo-app/lib/merchant-notifications/merchant-notifications.ts`).
 * A push that says one thing and a list row that says another reads as two
 * different problems, so the two copies must agree on every notice shape.
 *
 * The app module is pure (no React Native imports), so it runs here as is.
 */
import {
  canReadCashNotification,
  canReadMerchantNotification,
  describeCashNotification as describeCashForPush,
  describeStockNotification as describeForPush,
  type AccountRow,
  type CashNotification,
  type StockNotification,
} from '@/lib/push/merchant-notification-push'
import {
  canSeeCashNotifications,
  canSeeMerchantNotifications,
  describeCashNotification as describeCashForList,
  describeStockNotification as describeForList,
  type MerchantNotification,
} from '../../webnegosyo-app/lib/merchant-notifications/merchant-notifications'

const TENANT = 'tenant-1'

const BASE: StockNotification = {
  id: 'n1',
  tenant_id: TENANT,
  outlet_id: null,
  kind: 'stock_low',
  inventory_item_id: 'item-flour',
  item_name: 'Flour',
  unit: 'kg',
  outlet_name: null,
  quantity: 2.5,
  reorder_level: 5,
}

const SHAPES: ReadonlyArray<[string, Partial<StockNotification>]> = [
  ['low with a reorder line', {}],
  ['low without a unit', { unit: null }],
  ['low without a reorder line', { reorder_level: null }],
  ['low at a zero reorder line', { reorder_level: 0 }],
  ['low with long decimals', { quantity: 1.23456, reorder_level: 4.5 }],
  ['low at zero left', { quantity: 0 }],
  ['low with an unknown quantity', { quantity: null }],
  ['out of stock', { kind: 'stock_out', quantity: 0 }],
  ['out at a branch', { kind: 'stock_out', outlet_id: 'o-north', outlet_name: 'North' }],
  ['low at a branch', { outlet_id: 'o-north', outlet_name: 'North' }],
  ['a branch whose name is gone', { outlet_id: 'o-north', outlet_name: null }],
]

function toListNotice(n: StockNotification): MerchantNotification {
  return {
    id: n.id,
    kind: n.kind,
    outletId: n.outlet_id,
    outletName: n.outlet_name,
    inventoryItemId: n.inventory_item_id,
    itemName: n.item_name,
    unit: n.unit,
    quantity: n.quantity,
    reorderLevel: n.reorder_level,
    createdAt: '2026-10-12T08:00:00.000Z',
    isResolved: false,
  }
}

describe('merchant notification wording: push and app list agree', () => {
  it.each(SHAPES)('%s', (_label, overrides) => {
    const notice = { ...BASE, ...overrides }
    expect(describeForList(toListNotice(notice))).toEqual(describeForPush(notice))
  })
})

describe('merchant notification recipients: push and app bell agree', () => {
  const ACCOUNTS: ReadonlyArray<[string, Partial<AccountRow>]> = [
    ['the owner', { is_owner: true, permissions: [] }],
    ['a full-access admin', { permissions: null }],
    ['staff who can open Stock', { permissions: ['menu'] }],
    ['staff who cannot', { permissions: ['pos', 'orders'] }],
    ['staff with no permissions', { permissions: [] }],
  ]

  it.each(ACCOUNTS)('%s, on a store-wide notice', (_label, overrides) => {
    const account: AccountRow = {
      user_id: 'u1',
      tenant_id: TENANT,
      role: 'admin',
      is_owner: false,
      permissions: null,
      outlet_id: null,
      ...overrides,
    }
    const isPushed = canReadMerchantNotification(account, { tenant_id: TENANT, outlet_id: null })
    const isBellShown = canSeeMerchantNotifications({
      isAuthenticated: true,
      isDemo: false,
      isOwner: account.is_owner === true,
      isSuperadmin: false,
      impersonatedTenantId: null,
      permissions: account.permissions,
    })
    expect(isBellShown).toBe(isPushed)
  })
})

// ── Cash alerts (CONTRACTS W3.3) ───────────────────────────────────────────

const CASH_BASE: CashNotification = {
  id: 'c1',
  tenant_id: TENANT,
  outlet_id: null,
  kind: 'shift_overdue',
  item_name: 'Ben Cruz',
  outlet_name: null,
  drawer_name: 'Cashier 2',
  cash_cents: null,
  shift_id: 'shift-1',
  remittance_id: null,
}

const CASH_SHAPES: ReadonlyArray<[string, Partial<CashNotification>]> = [
  ['an overdue shift', {}],
  ['an overdue shift at a branch', { outlet_id: 'o-north', outlet_name: 'North' }],
  ['an overdue shift with no drawer name', { drawer_name: null }],
  ['a branch whose name is gone', { outlet_id: 'o-north', outlet_name: null }],
  ['a one-word name', { item_name: 'Ben' }],
  ['a name with extra spaces', { item_name: '  Ana   Reyes ' }],
  ['a waiting remittance in whole pesos', { kind: 'remittance_pending', shift_id: null, remittance_id: 'r1', cash_cents: 634500 }],
  ['a waiting remittance with centavos', { kind: 'remittance_pending', remittance_id: 'r1', cash_cents: 634550 }],
  ['a big waiting remittance', { kind: 'remittance_pending', remittance_id: 'r1', cash_cents: 123456700 }],
  ['an uncounted waiting remittance', { kind: 'remittance_pending', remittance_id: 'r1', cash_cents: null }],
  ['a waiting remittance at a branch', { kind: 'remittance_pending', remittance_id: 'r1', cash_cents: 100, outlet_id: 'o-north', outlet_name: 'North' }],
]

function toCashListNotice(n: CashNotification): MerchantNotification {
  return {
    id: n.id,
    kind: n.kind,
    outletId: n.outlet_id,
    outletName: n.outlet_name,
    inventoryItemId: null,
    itemName: n.item_name,
    unit: null,
    quantity: null,
    reorderLevel: null,
    createdAt: '2026-10-27T08:00:00.000Z',
    isResolved: false,
    shiftId: n.shift_id,
    remittanceId: n.remittance_id,
    drawerName: n.drawer_name,
    cashCents: n.cash_cents,
  }
}

describe('cash alert wording: push and app list agree', () => {
  it.each(CASH_SHAPES)('%s', (_label, overrides) => {
    const notice = { ...CASH_BASE, ...overrides }
    expect(describeCashForList(toCashListNotice(notice))).toEqual(describeCashForPush(notice))
  })
})

describe('cash alert recipients: push and app bell agree (cash_manage)', () => {
  const ACCOUNTS: ReadonlyArray<[string, Partial<AccountRow>]> = [
    ['the owner', { is_owner: true, permissions: [] }],
    ['a full-access admin', { permissions: null }],
    ['staff who handle cash', { permissions: ['cash_manage'] }],
    ['staff who open Stock but not cash', { permissions: ['menu', 'store_setup'] }],
    ['a cashier', { permissions: ['pos'] }],
    ['staff with no permissions', { permissions: [] }],
  ]

  it.each(ACCOUNTS)('%s, on a store-wide alert', (_label, overrides) => {
    const account: AccountRow = {
      user_id: 'u1',
      tenant_id: TENANT,
      role: 'admin',
      is_owner: false,
      permissions: null,
      outlet_id: null,
      ...overrides,
    }
    const isPushed = canReadCashNotification(account, { tenant_id: TENANT, outlet_id: null })
    const isBellShown = canSeeCashNotifications({
      isAuthenticated: true,
      isDemo: false,
      isOwner: account.is_owner === true,
      isSuperadmin: false,
      impersonatedTenantId: null,
      permissions: account.permissions,
    })
    expect(isBellShown).toBe(isPushed)
  })
})
