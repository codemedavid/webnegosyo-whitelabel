/**
 * Cash alert pushes (CONTRACTS W3.3): the exact wording, the push data the
 * app routes on, and who hears them — `cash_manage` holders, branch-locked
 * ones only for their own branch, never another store.
 */
import {
  buildCashNotificationMessages,
  canReadCashNotification,
  describeCashNotification,
  formatCashAlertAmount,
  isCashNotificationKind,
  type AccountRow,
  type CashNotification,
  type DeviceAccount,
} from '@/lib/push/merchant-notification-push'

const TENANT = '11111111-1111-4111-8111-111111111111'

function notice(overrides: Partial<CashNotification> = {}): CashNotification {
  return {
    id: 'n1',
    tenant_id: TENANT,
    outlet_id: null,
    kind: 'shift_overdue',
    item_name: 'Ben Cruz',
    outlet_name: null,
    drawer_name: 'Cashier 2',
    cash_cents: null,
    shift_id: 'shift-1',
    remittance_id: null,
    ...overrides,
  }
}

function account(overrides: Partial<AccountRow> = {}): AccountRow {
  return { user_id: 'u1', tenant_id: TENANT, role: 'admin', is_owner: false, permissions: ['cash_manage'], outlet_id: null, ...overrides }
}

describe('describeCashNotification', () => {
  it('words an overdue shift by first name, with where and what to do', () => {
    expect(describeCashNotification(notice())).toEqual({ title: "Ben's shift is still open", body: 'Cashier 2 · End it from the Drawer' })
    expect(describeCashNotification(notice({ outlet_id: 'north', outlet_name: 'North', drawer_name: null }))).toEqual({
      title: "Ben's shift is still open",
      body: 'North · End it from the Drawer',
    })
  })

  it('names the branch only for a branch notice', () => {
    expect(describeCashNotification(notice({ outlet_id: null, outlet_name: 'North' })).body).toBe('Cashier 2 · End it from the Drawer')
  })

  it('words a waiting remittance with its amount, or without one when uncounted', () => {
    const waiting = notice({ kind: 'remittance_pending', item_name: 'Ana Reyes', cash_cents: 634500, remittance_id: 'r1' })

    expect(describeCashNotification(waiting)).toEqual({ title: "Ana's ₱6,345 is waiting to be accepted", body: 'Cashier 2 · Accept it in Remittances' })
    expect(describeCashNotification({ ...waiting, cash_cents: 634550 }).title).toBe("Ana's ₱6,345.50 is waiting to be accepted")
    expect(describeCashNotification({ ...waiting, cash_cents: null }).title).toBe("Ana's remittance is waiting to be accepted")
  })

  it('formats amounts as the contract says', () => {
    expect(formatCashAlertAmount(100)).toBe('₱1')
    expect(formatCashAlertAmount(1234505)).toBe('₱12,345.05')
  })
})

describe('canReadCashNotification', () => {
  it('needs cash_manage: owners and holders yes; legacy full access (opt-in key) and others no', () => {
    expect(canReadCashNotification(account({ is_owner: true, permissions: [] }), notice())).toBe(true)
    expect(canReadCashNotification(account({ permissions: null }), notice())).toBe(false)
    expect(canReadCashNotification(account(), notice())).toBe(true)
    expect(canReadCashNotification(account({ permissions: ['menu', 'pos', 'store_setup'] }), notice())).toBe(false)
  })

  it('keeps branch-locked staff to their branch and everyone to their store', () => {
    const north = notice({ outlet_id: 'north', outlet_name: 'North' })

    expect(canReadCashNotification(account({ outlet_id: 'north' }), north)).toBe(true)
    expect(canReadCashNotification(account({ outlet_id: 'south' }), north)).toBe(false)
    expect(canReadCashNotification(account({ tenant_id: 'other' }), north)).toBe(false)
    expect(canReadCashNotification(account({ role: 'platform_staff' }), north)).toBe(false)
  })
})

describe('buildCashNotificationMessages', () => {
  const device = (overrides: Partial<AccountRow>, token: string): DeviceAccount => ({ ...account(overrides), token })

  it('sends each readable alert to each device, with the data the app routes on', () => {
    const messages = buildCashNotificationMessages(
      [notice(), notice({ id: 'n2', kind: 'remittance_pending', shift_id: null, remittance_id: 'r1', cash_cents: 50000 })],
      [device({}, 'manager'), device({ permissions: ['pos'] }, 'cashier')],
    )

    expect(messages.map((message) => [message.to, message.data])).toEqual([
      ['manager', { type: 'cash_alert', kind: 'shift_overdue', shiftId: 'shift-1' }],
      ['manager', { type: 'cash_alert', kind: 'remittance_pending', remittanceId: 'r1' }],
    ])
    expect(messages[0]).toMatchObject({ channelId: 'cash-alerts', sound: 'default', priority: 'high' })
  })

  it('tells the cash kinds apart from stock', () => {
    expect(isCashNotificationKind('shift_overdue')).toBe(true)
    expect(isCashNotificationKind('remittance_pending')).toBe(true)
    expect(isCashNotificationKind('stock_low')).toBe(false)
  })
})
