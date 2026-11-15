import { alertName, buildChatAlertMessages, canAnswerChat } from '@/lib/messenger/staff-alert'
import type { DeviceAccount } from '@/lib/push/merchant-notification-push'

const T = 'tenant-1'
const device = (extra: Partial<DeviceAccount>): DeviceAccount => ({
  token: 'ExponentPushToken[a]', user_id: 'u1', tenant_id: T, role: 'admin', is_owner: false, permissions: null, outlet_id: null, ...extra,
})

describe('canAnswerChat', () => {
  it('reaches the owner and store-wide accounts that can read orders and use the register', () => {
    expect(canAnswerChat(device({ is_owner: true, permissions: [] }), T)).toBe(true)
    expect(canAnswerChat(device({ permissions: null }), T)).toBe(true)
    expect(canAnswerChat(device({ permissions: ['pos'] }), T)).toBe(true)
  })

  it('skips branch accounts, accounts without the register or an order key, and other stores', () => {
    expect(canAnswerChat(device({ outlet_id: 'b1' }), T)).toBe(false)
    expect(canAnswerChat(device({ permissions: ['orders'] }), T)).toBe(false)
    expect(canAnswerChat(device({ permissions: ['menu'] }), T)).toBe(false)
    expect(canAnswerChat(device({ tenant_id: 'tenant-2' }), T)).toBe(false)
    expect(canAnswerChat(device({ role: 'customer' }), T)).toBe(false)
  })
})

describe('buildChatAlertMessages', () => {
  it('names the customer and the moment, shows what they wrote, and opens the chat', () => {
    const messages = buildChatAlertMessages({
      tenantId: T, sessionId: 's1', reason: 'typed_order', customerName: 'Ana C.',
      text: 'pa order po 2 chicken inasal tsaka 1 halo halo, pickup 6pm, salamat po ng marami!!', devices: [device({}), device({ token: 'x', outlet_id: 'b1' })],
    })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ channelId: 'chat-alerts', title: 'Ana C. typed an order', data: { type: 'messenger_chat', sessionId: 's1' } })
    expect(messages[0].body.length).toBeLessThanOrEqual(60)
    expect(messages[0].body.endsWith('…')).toBe(true)
  })

  it('sends one push per device even when a device appears twice', () => {
    expect(buildChatAlertMessages({ tenantId: T, sessionId: 's1', reason: 'asked', customerName: 'Ana', text: '', devices: [device({}), device({})] }))
      .toEqual([expect.objectContaining({ title: 'Ana wants to talk to someone', body: 'Open the chat to reply.' })])
  })
})

describe('alertName', () => {
  it('shortens the last name and has a label without a name', () => {
    expect(alertName('Ana', 'Cruz')).toBe('Ana C.')
    expect(alertName('Ana', null)).toBe('Ana')
    expect(alertName(null, null)).toBe('A Messenger customer')
  })
})
