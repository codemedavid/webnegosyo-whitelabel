import {
  resolveMessengerHandoff,
  shouldSendOrderProactively,
  type MessengerHandoffTenant,
} from '@/lib/checkout/messenger-handoff'

const CONNECTED: Record<string, unknown> = {
  facebook_page_id: 'fb-row',
  messenger_username: null,
  messenger_page_id: null,
  messenger_redirect_mode: 'prefill',
}

/** The row as the database returns it, nulls included. */
const tenantWith = (overrides: Record<string, unknown> = {}): MessengerHandoffTenant =>
  ({ ...CONNECTED, ...overrides }) as unknown as MessengerHandoffTenant

describe('resolveMessengerHandoff', () => {
  it('prefills the order message for a connected page', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith(),
      facebookPageId: 'acme.page',
      isMessengerEnabled: true,
      message: 'Hello order',
    })

    expect(handoff.messengerUrl).toBe('https://m.me/acme.page?text=Hello%20order')
    expect(handoff.isDirectMode).toBe(false)
    expect(handoff.isFacebookPageConnected).toBe(true)
  })

  it('opens the page without a message in direct mode', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith({ messenger_redirect_mode: 'direct' }),
      facebookPageId: 'acme.page',
      isMessengerEnabled: true,
      message: 'Hello order',
    })

    expect(handoff.messengerUrl).toBe('https://www.messenger.com/t/acme.page')
    expect(handoff.isDirectMode).toBe(true)
  })

  it('builds no link when Messenger is off for the order type', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith(),
      facebookPageId: 'acme.page',
      isMessengerEnabled: false,
      message: 'Hello order',
    })

    expect(handoff.messengerUrl).toBeNull()
  })

  it('falls back to the typed username, which is not a connected page', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith({ messenger_username: 'acme.typed' }),
      facebookPageId: null,
      isMessengerEnabled: true,
      message: 'Hi',
    })

    expect(handoff.messengerUrl).toBe('https://m.me/acme.typed?text=Hi')
    expect(handoff.isFacebookPageConnected).toBe(false)
  })

  it('falls back to the stored page id when there is no username', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith({ messenger_page_id: '12345' }),
      facebookPageId: null,
      isMessengerEnabled: true,
      message: 'Hi',
    })

    expect(handoff.messengerUrl).toBe('https://m.me/12345?text=Hi')
    expect(handoff.isFacebookPageConnected).toBe(false)
  })

  it('is not connected without a facebook_page_id row, even with a resolved page', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith({ facebook_page_id: null }),
      facebookPageId: 'acme.page',
      isMessengerEnabled: true,
      message: 'Hi',
    })

    expect(handoff.isFacebookPageConnected).toBe(false)
  })

  it('builds no link for a blank page id', () => {
    const handoff = resolveMessengerHandoff({
      tenant: tenantWith({ messenger_username: '   ' }),
      facebookPageId: null,
      isMessengerEnabled: true,
      message: 'Hi',
    })

    expect(handoff.messengerUrl).toBeNull()
  })
})

describe('shouldSendOrderProactively', () => {
  const handoff = { messengerUrl: 'x', isDirectMode: false, isFacebookPageConnected: true }

  it('sends a saved order to a connected page in prefill mode', () => {
    expect(shouldSendOrderProactively({ isMessengerEnabled: true, handoff, orderId: 'o1', orderToken: 't1' })).toBe(true)
  })

  it.each([
    ['Messenger is off', { isMessengerEnabled: false, handoff, orderId: 'o1', orderToken: 't1' }],
    ['direct mode', { isMessengerEnabled: true, handoff: { ...handoff, isDirectMode: true }, orderId: 'o1', orderToken: 't1' }],
    ['no connected page', { isMessengerEnabled: true, handoff: { ...handoff, isFacebookPageConnected: false }, orderId: 'o1', orderToken: 't1' }],
    ['no order id', { isMessengerEnabled: true, handoff, orderId: undefined, orderToken: 't1' }],
    ['no order token', { isMessengerEnabled: true, handoff, orderId: 'o1', orderToken: undefined }],
  ])('does not send when %s', (_label, input) => {
    expect(shouldSendOrderProactively(input)).toBe(false)
  })
})
