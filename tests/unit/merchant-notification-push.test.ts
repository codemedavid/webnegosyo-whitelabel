/**
 * Low-stock pushes for the merchant app's bell.
 *
 * `merchant_notifications` rows are written by a statement trigger on
 * `stock_alerts`; the route turns a batch of them into one push per device.
 * Who hears what mirrors the table's RLS
 * (`app_user_may_read_merchant_notifications`): anyone who can open Stock,
 * confined to their branch.
 */
import {
  buildMerchantNotificationMessages,
  canReadMerchantNotification,
  describeStockNotification,
  formatStockQuantity,
  joinDeviceAccounts,
  parseNotifyMerchantPayload,
  type DeviceAccount,
  type StockNotification,
} from '@/lib/push/merchant-notification-push'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const NORTH = 'outlet-north'
const SOUTH = 'outlet-south'

function notification(overrides: Partial<StockNotification> = {}): StockNotification {
  return {
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
    ...overrides,
  }
}

function account(overrides: Partial<DeviceAccount> = {}): DeviceAccount {
  return {
    token: 'ExponentPushToken[owner]',
    user_id: 'user-owner',
    tenant_id: TENANT,
    role: 'admin',
    is_owner: true,
    permissions: null,
    outlet_id: null,
    ...overrides,
  }
}

describe('parseNotifyMerchantPayload', () => {
  it('accepts a list of notification ids', () => {
    const id = '33333333-3333-4333-8333-333333333333'
    expect(parseNotifyMerchantPayload({ notification_ids: [id] })).toEqual({
      notification_ids: [id],
    })
  })

  it('refuses anything else', () => {
    expect(parseNotifyMerchantPayload(null)).toBeNull()
    expect(parseNotifyMerchantPayload({ notification_ids: [] })).toBeNull()
    expect(parseNotifyMerchantPayload({ notification_ids: ['not-a-uuid'] })).toBeNull()
    expect(parseNotifyMerchantPayload({ order_id: TENANT })).toBeNull()
  })
})

describe('canReadMerchantNotification', () => {
  it('lets the owner read every branch', () => {
    expect(canReadMerchantNotification(account(), notification({ outlet_id: NORTH }))).toBe(true)
  })

  it('lets a store-wide admin with full access read', () => {
    expect(canReadMerchantNotification(account({ is_owner: false }), notification())).toBe(true)
  })

  it('lets staff with the menu permission (who can open Stock) read', () => {
    const staff = account({ is_owner: false, permissions: ['orders', 'menu'] })
    expect(canReadMerchantNotification(staff, notification())).toBe(true)
  })

  it('keeps staff without the menu permission out', () => {
    const cashier = account({ is_owner: false, permissions: ['orders', 'pos'] })
    expect(canReadMerchantNotification(cashier, notification())).toBe(false)
  })

  it('confines a branch account to its own branch, but shows it store-wide alerts', () => {
    const northAdmin = account({ is_owner: false, outlet_id: NORTH })
    expect(canReadMerchantNotification(northAdmin, notification({ outlet_id: NORTH }))).toBe(true)
    expect(canReadMerchantNotification(northAdmin, notification({ outlet_id: SOUTH }))).toBe(false)
    expect(canReadMerchantNotification(northAdmin, notification({ outlet_id: null }))).toBe(true)
  })

  it('never crosses stores', () => {
    expect(canReadMerchantNotification(account({ tenant_id: OTHER_TENANT }), notification())).toBe(
      false,
    )
  })

  it('ignores accounts that are not store admins', () => {
    expect(canReadMerchantNotification(account({ role: 'customer' }), notification())).toBe(false)
  })
})

describe('formatStockQuantity', () => {
  it('drops trailing zeros and keeps up to two decimals', () => {
    expect(formatStockQuantity(2.5, 'kg')).toBe('2.5 kg')
    expect(formatStockQuantity(5, 'kg')).toBe('5 kg')
    expect(formatStockQuantity(1.23456, 'L')).toBe('1.23 L')
  })

  it('works without a unit', () => {
    expect(formatStockQuantity(3, null)).toBe('3')
  })
})

describe('describeStockNotification', () => {
  it('says an ingredient is running low, with what is left and the reorder line', () => {
    expect(describeStockNotification(notification())).toEqual({
      title: 'Flour is running low',
      body: '2.5 kg left · reorder at 5 kg',
    })
  })

  it('says an ingredient is out of stock', () => {
    expect(
      describeStockNotification(notification({ kind: 'stock_out', quantity: 0 })),
    ).toEqual({
      title: 'Flour is out of stock',
      body: 'None left · reorder at 5 kg',
    })
  })

  it('names the branch when the alert is about one', () => {
    expect(
      describeStockNotification(notification({ outlet_id: NORTH, outlet_name: 'North' })).body,
    ).toBe('North · 2.5 kg left · reorder at 5 kg')
  })

  it('leaves out the reorder line when none is set', () => {
    expect(
      describeStockNotification(notification({ kind: 'stock_out', quantity: 0, reorder_level: 0 }))
        .body,
    ).toBe('None left')
  })
})

describe('buildMerchantNotificationMessages', () => {
  it('sends one message per eligible device on the stock-alerts channel', () => {
    const messages = buildMerchantNotificationMessages(
      [notification()],
      [
        account(),
        account({ token: 'ExponentPushToken[cashier]', is_owner: false, permissions: ['pos'] }),
      ],
    )

    expect(messages).toEqual([
      {
        to: 'ExponentPushToken[owner]',
        sound: 'default',
        channelId: 'stock-alerts',
        priority: 'high',
        title: 'Flour is running low',
        body: '2.5 kg left · reorder at 5 kg',
        data: { type: 'stock_alert', inventoryItemId: 'item-flour' },
      },
    ])
  })

  it('folds a batch into one message per device', () => {
    const messages = buildMerchantNotificationMessages(
      [
        notification({ id: 'n1', item_name: 'Flour', kind: 'stock_out', quantity: 0 }),
        notification({ id: 'n2', item_name: 'Sugar', inventory_item_id: 'item-sugar' }),
        notification({ id: 'n3', item_name: 'Rice', inventory_item_id: 'item-rice' }),
        notification({ id: 'n4', item_name: 'Eggs', inventory_item_id: 'item-eggs' }),
      ],
      [account()],
    )

    expect(messages).toHaveLength(1)
    expect(messages[0].title).toBe('4 ingredients need restocking')
    expect(messages[0].body).toBe('Out: Flour · Low: Sugar, Rice and 1 more')
    expect(messages[0].data).toEqual({ type: 'stock_alert' })
  })

  it('gives each device only what its account may see', () => {
    const messages = buildMerchantNotificationMessages(
      [
        notification({ id: 'n1', outlet_id: NORTH, outlet_name: 'North', item_name: 'Flour' }),
        notification({ id: 'n2', outlet_id: SOUTH, outlet_name: 'South', item_name: 'Sugar' }),
      ],
      [
        account({ token: 'ExponentPushToken[north]', is_owner: false, outlet_id: NORTH }),
        account({ token: 'ExponentPushToken[owner]' }),
      ],
    )

    const north = messages.find((m) => m.to === 'ExponentPushToken[north]')
    const owner = messages.find((m) => m.to === 'ExponentPushToken[owner]')
    expect(north?.title).toBe('Flour is running low')
    expect(owner?.title).toBe('2 ingredients need restocking')
  })

  it('sends nothing when nobody may read the batch', () => {
    expect(
      buildMerchantNotificationMessages([notification()], [account({ tenant_id: OTHER_TENANT })]),
    ).toEqual([])
  })
})

describe('joinDeviceAccounts', () => {
  it('pairs each device with the account it signed into, dropping strays', () => {
    const joined = joinDeviceAccounts(
      [
        { token: 't-owner', user_id: 'u1', tenant_id: TENANT },
        { token: 't-stray', user_id: 'u-gone', tenant_id: TENANT },
        { token: 't-no-store', user_id: 'u1', tenant_id: null },
      ],
      [
        {
          user_id: 'u1',
          tenant_id: TENANT,
          role: 'admin',
          is_owner: true,
          permissions: null,
          outlet_id: null,
        },
      ],
    )

    expect(joined).toEqual([
      {
        token: 't-owner',
        user_id: 'u1',
        tenant_id: TENANT,
        role: 'admin',
        is_owner: true,
        permissions: null,
        outlet_id: null,
      },
    ])
  })
})
