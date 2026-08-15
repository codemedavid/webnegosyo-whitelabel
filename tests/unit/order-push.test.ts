/**
 * New-order push notifications for the platform Supabase order backend.
 *
 * Convex tenants ring merchant devices via `notifications:sendOrderNotification`
 * in each tenant's deployment. Platform-backend tenants had NOTHING: tokens were
 * never registered and no send path existed, so a backgrounded phone stayed
 * silent for every new order. This pure core mirrors the tested Convex rules
 * (`convex-template/convex/pushRecipients.ts` + `notifications.ts`):
 *
 * - a device with no branch hears every branch (owners, older builds)
 * - an order with no branch rings every device (single-location stores)
 * - message shape is identical (channelId "orders", "New Order!" title)
 *
 * Every rule fails toward noise rather than silence: an extra buzz is an
 * annoyance; a notification that reaches nobody loses the order.
 */
import {
  resolveOrderOutletId,
  selectPushRecipients,
  buildExpoPushMessages,
  chunkExpoPushMessages,
  parseNotifyOrderPayload,
  EXPO_PUSH_CHUNK_SIZE,
} from '@/lib/push/order-push'

const TOKENS = [
  { token: 'ExponentPushToken[owner]', outlet_id: null },
  { token: 'ExponentPushToken[north]', outlet_id: 'outlet-north' },
  { token: 'ExponentPushToken[south]', outlet_id: 'outlet-south' },
]

describe('resolveOrderOutletId', () => {
  it('prefers the outlet_id column when set', () => {
    expect(
      resolveOrderOutletId({
        outlet_id: 'outlet-north',
        customer_data: { outlet_id: 'outlet-south' },
      })
    ).toBe('outlet-north')
  })

  it('falls back to the branch stamped inside customer_data', () => {
    // Orders written before the column existed carry the branch only in the
    // blob — hiding them would silence the branch that took the order.
    expect(
      resolveOrderOutletId({ outlet_id: null, customer_data: { outlet_id: 'outlet-south' } })
    ).toBe('outlet-south')
  })

  it('returns null for an unbranched order', () => {
    expect(resolveOrderOutletId({ outlet_id: null, customer_data: {} })).toBeNull()
    expect(resolveOrderOutletId({ outlet_id: '  ', customer_data: null })).toBeNull()
  })
})

describe('selectPushRecipients', () => {
  it('rings every device for an unbranched order', () => {
    expect(selectPushRecipients(TOKENS, null)).toHaveLength(3)
  })

  it('rings only the branch and store-wide devices for a branched order', () => {
    const recipients = selectPushRecipients(TOKENS, 'outlet-north')
    expect(recipients.map((t) => t.token)).toEqual([
      'ExponentPushToken[owner]',
      'ExponentPushToken[north]',
    ])
  })

  it('returns an empty list when nobody is registered', () => {
    expect(selectPushRecipients([], 'outlet-north')).toEqual([])
  })
})

describe('buildExpoPushMessages', () => {
  const ORDER = {
    id: 'order-1',
    customerName: 'Ana',
    total: 249.5,
    itemCount: 2,
  }

  it('mirrors the Convex message shape exactly', () => {
    const [message] = buildExpoPushMessages([TOKENS[0]], ORDER)
    expect(message).toEqual({
      to: 'ExponentPushToken[owner]',
      sound: 'default',
      // Android must land on the high-importance "orders" channel or the
      // custom ringtone never plays.
      channelId: 'orders',
      title: 'New Order!',
      body: 'Ana — ₱249.50 (2 items)',
      data: { orderId: 'order-1' },
    })
  })

  it('singularizes a one-item order', () => {
    const [message] = buildExpoPushMessages([TOKENS[0]], { ...ORDER, itemCount: 1 })
    expect(message.body).toBe('Ana — ₱249.50 (1 item)')
  })

  it('builds one message per recipient', () => {
    expect(buildExpoPushMessages(TOKENS, ORDER)).toHaveLength(3)
  })
})

describe('chunkExpoPushMessages', () => {
  it('splits batches at the Expo API limit', () => {
    const messages = Array.from({ length: EXPO_PUSH_CHUNK_SIZE + 1 }, (_, i) => ({
      to: `token-${i}`,
    }))
    const chunks = chunkExpoPushMessages(messages)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(EXPO_PUSH_CHUNK_SIZE)
    expect(chunks[1]).toHaveLength(1)
  })

  it('returns no chunks for no messages', () => {
    expect(chunkExpoPushMessages([])).toEqual([])
  })
})

describe('parseNotifyOrderPayload', () => {
  const VALID = {
    order_id: '4c4b9e0a-8f2d-4a51-9d15-0f4d8c9a1b2c',
    tenant_id: '9a1b2c3d-4e5f-4a51-9d15-0f4d8c9a1b2c',
  }

  it('accepts the trigger payload', () => {
    expect(parseNotifyOrderPayload(VALID)).toEqual(VALID)
  })

  it('rejects a payload missing either id', () => {
    expect(parseNotifyOrderPayload({ order_id: VALID.order_id })).toBeNull()
    expect(parseNotifyOrderPayload({ tenant_id: VALID.tenant_id })).toBeNull()
  })

  it('rejects non-uuid ids', () => {
    expect(parseNotifyOrderPayload({ ...VALID, order_id: 'not-a-uuid' })).toBeNull()
    expect(parseNotifyOrderPayload('garbage')).toBeNull()
  })
})
