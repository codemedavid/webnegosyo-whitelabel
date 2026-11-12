import { APP_ORDER_KINDS, APP_ORDER_STATUSES, appOrderPushDataSchema, appPushTokenRegistrationSchema } from '@/lib/app-contract'
import { buildOrderPushMessages, orderPushText, orderPushTitle } from '@/lib/app-api/push/order-push-words'
import { runCustomerOrderPush, type CustomerOrderPushDeps, type PushIndexRow, type PushOrderRow } from '@/lib/app-api/push/run-order-push'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT = '22222222-2222-4222-8222-222222222222'
const CUSTOMER = '33333333-3333-4333-8333-333333333333'

describe('orderPushText', () => {
  it('pushes Accepted, Ready and Cancelled for every kind, never Pending or Preparing', () => {
    for (const kind of APP_ORDER_KINDS) {
      expect(orderPushText('confirmed', kind, '07')).toBe('Order 07 was accepted. We’ll let you know when it’s ready.')
      expect(orderPushText('ready', kind, '07')).not.toBeNull()
      expect(orderPushText('cancelled', kind, '07')).toBe('Order 07 was cancelled. Open the app for details.')
      expect(orderPushText('pending', kind, '07')).toBeNull()
      expect(orderPushText('preparing', kind, '07')).toBeNull()
    }
  })

  it('says Delivered only to orders a rider takes', () => {
    expect(orderPushText('delivered', 'delivery', '07')).toBe('Order 07 was delivered. Enjoy!')
    expect(orderPushText('delivered', 'grab', null)).toBe('Your order was delivered. Enjoy!')
    for (const kind of ['pickup', 'dine_in', 'other'] as const) expect(orderPushText('delivered', kind, '07')).toBeNull()
  })

  it('words Ready by how the order leaves the store', () => {
    expect(orderPushText('ready', 'pickup', '07')).toBe('Order 07 is ready for pickup.')
    expect(orderPushText('ready', 'other', '07')).toBe('Order 07 is ready for pickup.')
    expect(orderPushText('ready', 'dine_in', '07')).toBe('Order 07 is ready and on its way to your table.')
    expect(orderPushText('ready', 'delivery', '07')).toBe('Order 07 is packed and waiting for the rider.')
  })

  it('never puts a peso amount, a digit other than the order number, or a name on the lock screen', () => {
    for (const status of APP_ORDER_STATUSES) {
      for (const kind of APP_ORDER_KINDS) {
        const text = orderPushText(status, kind, null)
        if (text) expect(text).not.toMatch(/[₱0-9]/)
      }
    }
  })
})

describe('buildOrderPushMessages', () => {
  it('carries only what opens the order, on the orders channel', () => {
    const [message] = buildOrderPushMessages(['ExponentPushToken[abcdefgh]'], { storeName: 'Kape Demo', body: 'x', orderId: ORDER_ID, status: 'ready' })
    expect(message).toEqual({
      to: 'ExponentPushToken[abcdefgh]', title: 'Kape Demo', body: 'x', sound: 'default', channelId: 'orders', priority: 'high',
      data: { kind: 'order', orderId: ORDER_ID, status: 'ready' },
    })
    expect(appOrderPushDataSchema.parse(message.data)).toEqual(message.data)
  })

  it('titles a nameless store plainly and clips a long name', () => {
    expect(orderPushTitle(null)).toBe('Order update')
    expect(orderPushTitle('   ')).toBe('Order update')
    expect(orderPushTitle('A'.repeat(80))).toHaveLength(60)
  })
})

describe('appPushTokenRegistrationSchema', () => {
  it('takes an Expo token from a known platform only', () => {
    expect(appPushTokenRegistrationSchema.parse({ token: 'ExponentPushToken[abc_DEF-123]', platform: 'ios' })).toEqual({
      token: 'ExponentPushToken[abc_DEF-123]', platform: 'ios', appVersion: null,
    })
    expect(appPushTokenRegistrationSchema.safeParse({ token: 'fcm:abc', platform: 'ios' }).success).toBe(false)
    expect(appPushTokenRegistrationSchema.safeParse({ token: 'ExponentPushToken[abcdefgh]', platform: 'web' }).success).toBe(false)
    expect(appPushTokenRegistrationSchema.safeParse({ token: 'ExponentPushToken[abcdefgh]', platform: 'ios', customerId: CUSTOMER }).success).toBe(false)
  })
})

function fakeDeps(overrides: Partial<{ order: PushOrderRow | null; index: PushIndexRow | null; tokens: string[]; accepted: number; claimed: boolean }> = {}) {
  const calls = { claims: [] as unknown[], records: [] as unknown[], sends: [] as { tenantId: string; messages: unknown[] }[] }
  const deps: CustomerOrderPushDeps = {
    readOrder: async () => ('order' in overrides ? overrides.order ?? null : { id: ORDER_ID, tenantId: TENANT, status: 'ready' }),
    readIndexRow: async (tenantId) => {
      if ('index' in overrides) return overrides.index ?? null
      return tenantId === TENANT ? { customerId: CUSTOMER, orderKind: 'pickup', number: '07' } : null
    },
    claim: async (input) => {
      calls.claims.push(input)
      return overrides.claimed ?? true
    },
    record: async (input) => {
      calls.records.push(input)
    },
    readTokens: async () => overrides.tokens ?? ['ExponentPushToken[phone-one]', 'ExponentPushToken[phone-two]'],
    readStoreName: async () => 'Kape Demo',
    send: async (tenantId, messages) => {
      calls.sends.push({ tenantId, messages: [...messages] })
      return { accepted: overrides.accepted ?? messages.length }
    },
  }
  return { deps, calls }
}

describe('runCustomerOrderPush', () => {
  it('claims once and pushes the status to every live install of the customer', async () => {
    const { deps, calls } = fakeDeps()
    await expect(runCustomerOrderPush(ORDER_ID, deps)).resolves.toEqual({ outcome: 'sent', status: 'ready', devices: 2 })
    expect(calls.claims).toEqual([{ orderId: ORDER_ID, status: 'ready', tenantId: TENANT }])
    expect(calls.sends).toHaveLength(1)
    expect(calls.sends[0].tenantId).toBe(TENANT)
    expect(calls.sends[0].messages).toHaveLength(2)
    expect(calls.records).toEqual([{ orderId: ORDER_ID, status: 'ready', outcome: 'sent', devices: 2 }])
  })

  it('is silent on a replay', async () => {
    const { deps, calls } = fakeDeps({ claimed: false })
    await expect(runCustomerOrderPush(ORDER_ID, deps)).resolves.toEqual({ outcome: 'duplicate' })
    expect(calls.sends).toEqual([])
  })

  it('pushes nothing for an order that is not in the app index of ITS store, and claims nothing', async () => {
    const { deps, calls } = fakeDeps({ index: null })
    await expect(runCustomerOrderPush(ORDER_ID, deps)).resolves.toEqual({ outcome: 'not_app_order' })
    expect(calls.claims).toEqual([])
  })

  it('claims nothing for statuses that are not pushed (preparing, delivered pickup)', async () => {
    const preparing = fakeDeps({ order: { id: ORDER_ID, tenantId: TENANT, status: 'preparing' } })
    await expect(runCustomerOrderPush(ORDER_ID, preparing.deps)).resolves.toEqual({ outcome: 'not_pushed' })
    const delivered = fakeDeps({ order: { id: ORDER_ID, tenantId: TENANT, status: 'delivered' } })
    await expect(runCustomerOrderPush(ORDER_ID, delivered.deps)).resolves.toEqual({ outcome: 'not_pushed' })
    expect([...preparing.calls.claims, ...delivered.calls.claims]).toEqual([])
  })

  it('records no_devices when the customer never allowed notifications', async () => {
    const { deps, calls } = fakeDeps({ tokens: [] })
    await expect(runCustomerOrderPush(ORDER_ID, deps)).resolves.toEqual({ outcome: 'no_devices', status: 'ready', devices: 0 })
    expect(calls.sends).toEqual([])
    expect(calls.records).toEqual([{ orderId: ORDER_ID, status: 'ready', outcome: 'no_devices', devices: 0 }])
  })

  it('tells a partial send from a failed one', async () => {
    await expect(runCustomerOrderPush(ORDER_ID, fakeDeps({ accepted: 1 }).deps)).resolves.toMatchObject({ outcome: 'partly_sent', devices: 1 })
    await expect(runCustomerOrderPush(ORDER_ID, fakeDeps({ accepted: 0 }).deps)).resolves.toMatchObject({ outcome: 'send_failed', devices: 0 })
    const throwing = fakeDeps()
    throwing.deps.send = async () => {
      throw new Error('expo down')
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(runCustomerOrderPush(ORDER_ID, throwing.deps)).resolves.toMatchObject({ outcome: 'send_failed' })
    expect(throwing.calls.records).toEqual([{ orderId: ORDER_ID, status: 'ready', outcome: 'send_failed', devices: 0 }])
    spy.mockRestore()
  })

  it('answers not_found for an unknown order', async () => {
    await expect(runCustomerOrderPush(ORDER_ID, fakeDeps({ order: null }).deps)).resolves.toEqual({ outcome: 'not_found' })
  })
})
