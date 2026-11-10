/**
 * Order status messages. One message per (order, status), only inside Meta's
 * 24h window, only for statuses the owner chose, never on a store whose orders
 * aren't on the platform database, and never while staff have the bot paused.
 */
import { runOrderUpdate, type OrderUpdateDeps, type UpdateOrderRow, type UpdateStore } from '@/lib/messenger/order-update'
import {
  decideOrderUpdate, DEFAULT_ORDER_UPDATES, MESSAGING_WINDOW_MS, orderLabel, readOrderKind, readOrderUpdates, statusLabel,
} from '@/lib/messenger/order-view'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'

const NOW = new Date('2026-11-11T04:00:00Z')
const ORDER_ID = '0b0c9d3c-2222-4000-8000-000000000001'

function row(overrides: Partial<UpdateOrderRow> = {}): UpdateOrderRow {
  return {
    id: ORDER_ID, tenantId: 't1', status: 'ready', dailyNumber: 7, orderType: 'Pick up', orderTypeId: 'ot1',
    totalCentavos: 44700, psid: '24000000000000009', ...overrides,
  }
}

function store(overrides: Partial<UpdateStore> = {}): UpdateStore {
  return {
    name: 'Karamotan Grill', baseUrl: 'https://karamotan.webnegosyo.com', isPlatformOrders: true, botEnabled: true,
    orderUpdates: DEFAULT_ORDER_UPDATES, facebookPageRowId: 'page-row', ...overrides,
  }
}

function harness(options: {
  order?: UpdateOrderRow | null; store?: UpdateStore | null; claimed?: boolean
  lastInboundAt?: Date | null; pausedUntil?: Date | null; session?: boolean; sendOk?: boolean; token?: string | null
} = {}) {
  const sent: Array<{ psid: string; messages: readonly OutgoingMessage[] }> = []
  const recorded: string[] = []
  const claims: string[] = []
  const deps: OrderUpdateDeps = {
    now: () => NOW,
    readOrder: async () => (options.order === undefined ? row() : options.order),
    claim: async ({ status }) => { claims.push(status); return !options.claimed },
    record: async ({ outcome }) => { recorded.push(outcome) },
    loadStore: async () => (options.store === undefined ? store() : options.store),
    readSession: async () => (options.session === false ? null : {
      lastInboundAt: options.lastInboundAt === undefined ? new Date(NOW.getTime() - 60_000) : options.lastInboundAt,
      botPausedUntil: options.pausedUntil ?? null,
    }),
    readOrderTypeKind: async () => 'pickup',
    findPageToken: async () => (options.token === undefined ? 'page-token' : options.token),
    trackingUrl: (base, id) => `${base}/order/${id}?t=abc`,
    send: async (_token, psid, messages) => { sent.push({ psid, messages }); return options.sendOk === false ? { ok: false, sent: 0, error: { code: 10 } } : { ok: true, sent: messages.length } },
  }
  return { deps, sent, recorded, claims }
}

describe('runOrderUpdate', () => {
  it('sends the ready-for-pickup message with the tracking link, and records it', async () => {
    const h = harness()
    expect(await runOrderUpdate(ORDER_ID, h.deps)).toEqual({ outcome: 'sent', status: 'ready' })
    expect(h.sent).toEqual([{
      psid: '24000000000000009',
      messages: [{
        kind: 'buttons',
        text: '🛍️ Your order #07 is ready for pickup at Karamotan Grill!',
        buttons: [{ type: 'web_url', title: 'Track order', url: `https://karamotan.webnegosyo.com/order/${ORDER_ID}?t=abc` }],
      }],
    }])
    expect(h.recorded).toEqual(['sent'])
  })

  it('a replay (claim taken) sends nothing', async () => {
    const h = harness({ claimed: true })
    expect(await runOrderUpdate(ORDER_ID, h.deps)).toEqual({ outcome: 'duplicate' })
    expect(h.sent).toEqual([])
  })

  it('pending is the order being placed, not an update', async () => {
    const h = harness({ order: row({ status: 'pending' }) })
    expect(await runOrderUpdate(ORDER_ID, h.deps)).toEqual({ outcome: 'not_an_update' })
    expect(h.claims).toEqual([])
  })

  it.each([
    ['outside_window', { lastInboundAt: new Date(NOW.getTime() - MESSAGING_WINDOW_MS - 1) }],
    ['outside_window', { lastInboundAt: null }],
    ['no_session', { session: false }],
    ['bot_paused', { pausedUntil: new Date(NOW.getTime() + 60_000) }],
    ['not_platform', { store: store({ isPlatformOrders: false }) }],
    ['bot_off', { store: store({ botEnabled: false }) }],
    ['updates_off', { store: store({ orderUpdates: { ...DEFAULT_ORDER_UPDATES, enabled: false } }) }],
    ['status_not_chosen', { order: row({ status: 'confirmed' }) }],
    ['no_psid', { order: row({ psid: null }) }],
    ['no_page', { token: null }],
    ['no_store', { store: null }],
  ] as const)('%s: claimed, recorded, nothing sent', async (outcome, options) => {
    const h = harness(options as Parameters<typeof harness>[0])
    expect(await runOrderUpdate(ORDER_ID, h.deps)).toMatchObject({ outcome })
    expect(h.sent).toEqual([])
    expect(h.recorded).toEqual([outcome])
  })

  it('the owner\'s wording, with {store} and {order}', async () => {
    const h = harness({ store: store({ orderUpdates: { enabled: true, statuses: ['ready'], texts: { ready: 'Hi! {order} from {store} is ready 🎉' } } }) })
    await runOrderUpdate(ORDER_ID, h.deps)
    expect(h.sent[0].messages[0]).toMatchObject({ text: 'Hi! #07 from Karamotan Grill is ready 🎉' })
  })

  it('a refused send is recorded as send_failed', async () => {
    const h = harness({ sendOk: false })
    expect(await runOrderUpdate(ORDER_ID, h.deps)).toMatchObject({ outcome: 'send_failed' })
    expect(h.recorded).toEqual(['send_failed'])
  })
})

describe('order-view', () => {
  it('readOrderUpdates: missing = defaults on; a broken row sends nothing', () => {
    expect(readOrderUpdates(null)).toEqual(DEFAULT_ORDER_UPDATES)
    expect(readOrderUpdates({ enabled: true, statuses: ['ready', 'ready'], texts: {} }).statuses).toEqual(['ready'])
    expect(readOrderUpdates({ enabled: true, statuses: ['shipped'], texts: {} })).toEqual({ enabled: false, statuses: [], texts: {} })
    expect(readOrderUpdates({ enabled: true, statuses: [], texts: {}, extra: 1 }).enabled).toBe(false)
  })

  it('labels follow the order type', () => {
    expect(statusLabel('ready', 'pickup')).toBe('Ready for pickup')
    expect(statusLabel('ready', 'delivery')).toBe('Ready, on its way soon')
    expect(statusLabel('delivered', 'pickup')).toBe('Picked up')
    expect(readOrderKind('delivery')).toBe('delivery')
    expect(readOrderKind(null, 'Take out')).toBe('pickup')
    expect(readOrderKind(null, 'Dine-in')).toBe('dine_in')
    expect(orderLabel(7, 'abc')).toBe('#07')
    expect(orderLabel(null, 'abcdef123')).toBe('#ABCDEF')
  })

  it('the window edge: exactly 24h is still inside', () => {
    const base = { isPlatform: true, hasPsid: true, botEnabled: true, config: DEFAULT_ORDER_UPDATES, status: 'ready' as const, now: NOW }
    expect(decideOrderUpdate({ ...base, session: { lastInboundAt: new Date(NOW.getTime() - MESSAGING_WINDOW_MS), botPausedUntil: null } }).send).toBe(true)
  })
})
