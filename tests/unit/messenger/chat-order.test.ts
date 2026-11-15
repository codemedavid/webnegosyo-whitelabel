/**
 * Orders staff ring up for a Messenger customer (plan 2026-11-14, C2).
 *
 * What is pinned here: the summary goes out once, only to the chat of the
 * order's own store, only inside Meta's 24 hours; the customer is put on the
 * order by the server; every message fits Meta's limits; and a tap's reply
 * never leaves the customer without an answer.
 */
import {
  buildChatOrderSummary, buildChatOrderTapReply, chatOrderLineDetail, isChatOrderTap, isInsideWindow, MAX_SUMMARIES_PER_HOUR, runChatOrder, tapPausesBot,
  type ChatOrderDeps, type ChatOrderRow, type ChatOrderStore, type ChatOrderTapResult, type ChatOrderView, type PayChoice,
} from '@/lib/messenger/chat-order'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { charLength, MESSENGER_LIMITS } from '@/lib/messenger/limits'
import { readMessages } from '@/lib/messenger/messages/stored'
import { decodePayload, encodePayload } from '@/lib/messenger/payload'
import type { ChatLogLine } from '@/lib/messenger/chat-log'

const NOW = new Date('2026-11-14T04:00:00Z')
const ORDER_ID = '0b0c9d3c-2222-4000-8000-000000000001'
const SESSION_ID = '0b0c9d3c-1111-4000-8000-000000000001'
const METHOD_ID = '0b0c9d3c-3333-4000-8000-000000000001'
const PSID = '24000000000000009'

function view(overrides: Partial<ChatOrderView> = {}): ChatOrderView {
  return {
    id: ORDER_ID, label: '#07', status: 'pending', orderType: 'Pickup',
    lines: [
      { name: 'Chicken Inasal', qty: 2, lineCentavos: 39800, detail: 'Extra rice' },
      { name: 'Halo-halo', qty: 1, lineCentavos: 12000 },
    ],
    totalCentavos: 51800, isPaid: false, hasPaymentMethod: false, ...overrides,
  }
}

function row(overrides: Partial<ChatOrderRow> = {}): ChatOrderRow {
  return { ...view(), tenantId: 't1', sessionId: SESSION_ID, ...overrides }
}

function store(overrides: Partial<ChatOrderStore> = {}): ChatOrderStore {
  return { name: 'Karamotan Grill', isPlatformOrders: true, messages: readMessages(null), facebookPageRowId: 'page-row', ...overrides }
}

const gcash: PayChoice = { id: METHOD_ID, name: 'GCash', details: '0917 123 4567 · Karamotan Grill' }
const cash: PayChoice = { id: '0b0c9d3c-3333-4000-8000-000000000002', name: 'Cash on pickup', details: '' }
const ctx = { storeName: 'Karamotan Grill', customerName: 'Ana' }

function harness(options: {
  order?: ChatOrderRow | null; store?: ChatOrderStore | null; claimed?: boolean; session?: boolean
  lastInboundAt?: Date | null; token?: string | null; sendOk?: boolean; recent?: number
  /** What the order looks like once the dishes the register is still writing have arrived. */
  afterWaiting?: ChatOrderRow | null
} = {}) {
  let waits = 0
  const sent: Array<{ psid: string; messages: readonly OutgoingMessage[] }> = []
  const recorded: Array<{ outcome: string; isWaiting: boolean }> = []
  const attached: string[] = []
  const logged: ChatLogLine[] = []
  const sessionReads: Array<{ tenantId: string; sessionId: string }> = []
  const deps: ChatOrderDeps = {
    now: () => NOW,
    readOrder: async () => (options.order === undefined ? row() : options.order),
    waitForDishes: async () => {
      waits += 1
      return options.afterWaiting === undefined ? row() : options.afterWaiting
    },
    claim: async () => !options.claimed,
    record: async ({ outcome, isWaiting }) => { recorded.push({ outcome, isWaiting }) },
    loadStore: async () => (options.store === undefined ? store() : options.store),
    readSession: async (tenantId, sessionId) => {
      sessionReads.push({ tenantId, sessionId })
      return options.session === false ? null : {
        id: SESSION_ID, psid: PSID, firstName: 'Ana',
        lastInboundAt: options.lastInboundAt === undefined ? new Date(NOW.getTime() - 60_000) : options.lastInboundAt,
      }
    },
    countRecent: async () => options.recent ?? 0,
    attachCustomer: async ({ psid }) => { attached.push(psid); return true },
    findPageToken: async () => (options.token === undefined ? 'page-token' : options.token),
    send: async (_token, psid, messages) => {
      sent.push({ psid, messages })
      return options.sendOk === false ? { ok: false, sent: 0, error: { code: 10 } } : { ok: true, sent: messages.length }
    },
    logChat: async ({ lines }) => { logged.push(...lines) },
  }
  return { deps, sent, recorded, attached, logged, sessionReads, waits: () => waits }
}

function textsOf(messages: readonly OutgoingMessage[]): string {
  return messages.map((message) => ('text' in message ? message.text : '')).join('\n---\n')
}

describe('the summary a customer confirms', () => {
  it('lists the dishes, the order type and the total, then Confirm / Change', () => {
    const [summary, ask] = buildChatOrderSummary(ctx, view())
    expect(summary).toEqual({
      kind: 'text',
      text: [
        '🧾 Here is your order at Karamotan Grill, Ana:',
        '',
        '2 × Chicken Inasal · ₱398',
        '   Extra rice',
        '1 × Halo-halo · ₱120',
        '',
        'Pickup',
        'Total: ₱518',
      ].join('\n'),
    })
    expect(ask.kind).toBe('buttons')
    if (ask.kind !== 'buttons') return
    expect(ask.buttons.map((button) => button.title)).toEqual(['✅ Confirm order', '✏️ Change something'])
    expect(ask.buttons.map((button) => (button.type === 'postback' ? decodePayload(button.payload) : null))).toEqual([
      { verb: 'order_ok', orderId: ORDER_ID },
      { verb: 'order_change', orderId: ORDER_ID },
    ])
  })

  it('greets a customer Meta gave no name for without a dangling comma', () => {
    const [summary] = buildChatOrderSummary({ storeName: 'Karamotan Grill', customerName: '' }, view())
    expect(textsOf([summary]).split('\n')[0]).toBe('🧾 Here is your order at Karamotan Grill:')
  })

  it('uses the owner\'s words and Taglish', () => {
    const custom = readMessages({ lang: 'tl', 'chatorder.ask': 'Okay na po ba, {name}? Total {total}.' })
    const [summary, ask] = buildChatOrderSummary({ ...ctx, messages: custom }, view())
    expect(textsOf([summary])).toContain('Ito ang order mo sa Karamotan Grill, Ana:')
    expect(textsOf([ask])).toBe('Okay na po ba, Ana? Total ₱518.')
    if (ask.kind === 'buttons') expect(ask.buttons[0].title).toBe('✅ I-confirm')
  })

  it('stays inside Meta\'s limits for a very long order', () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      name: `Dish number ${index} ${'with a very long name '.repeat(8)}`, qty: 50, lineCentavos: 123456, detail: 'x'.repeat(400),
    }))
    const [summary, ask] = buildChatOrderSummary(ctx, view({ lines }))
    expect(charLength(textsOf([summary]))).toBeLessThanOrEqual(MESSENGER_LIMITS.text)
    expect(textsOf([summary])).toContain('Dish number 0')
    // The total is never the part that gets cut.
    expect(textsOf([summary]).endsWith('Pickup\nTotal: ₱518')).toBe(true)
    expect(textsOf([summary])).toMatch(/\+\d+ more/)
    if (ask.kind !== 'buttons') throw new Error('expected buttons')
    expect(charLength(ask.text)).toBeLessThanOrEqual(MESSENGER_LIMITS.buttonTemplateText)
  })

  it('keeps the adjustments and the total for many detailed dishes, the rest as "+N more"', () => {
    const lines = Array.from({ length: 25 }, (_, index) => ({
      name: `Family Platter ${index} ${'extra long name '.repeat(4)}`, qty: 2, lineCentavos: 99900, detail: `Large · ${'add-on · '.repeat(12)}`,
    }))
    const [summary, ask] = buildChatOrderSummary(ctx, view({ lines, adjustments: [{ label: 'Delivery fee', centavos: 4900 }], orderType: 'Delivery' }))
    const text = textsOf([summary])
    expect(charLength(text)).toBeLessThanOrEqual(MESSENGER_LIMITS.text)
    expect(text.split('\n').slice(-4)).toEqual(['Delivery fee · ₱49', '', 'Delivery', 'Total: ₱518'])
    const shown = (text.match(/^2 × Family Platter/gm) ?? []).length
    expect(text).toContain(`+${25 - shown} more`)
    expect(shown).toBeGreaterThan(0)
    if (ask.kind !== 'buttons') throw new Error('expected buttons')
    expect(charLength(ask.text)).toBeLessThanOrEqual(MESSENGER_LIMITS.buttonTemplateText)
    for (const button of ask.buttons) {
      expect(charLength(button.title)).toBeLessThanOrEqual(MESSENGER_LIMITS.buttonTitle)
      if (button.type === 'postback') expect(charLength(button.payload)).toBeLessThanOrEqual(MESSENGER_LIMITS.payload)
    }
  })

  it('shows what stands between the dishes and the total', () => {
    const [summary] = buildChatOrderSummary(ctx, view({
      adjustments: [{ label: 'Discount', centavos: -5000 }, { label: 'Delivery fee', centavos: 4900 }], totalCentavos: 51700, orderType: 'Delivery',
    }))
    expect(textsOf([summary]).split('\n').slice(4)).toEqual(['1 × Halo-halo · ₱120', '', 'Discount · -₱50', 'Delivery fee · ₱49', '', 'Delivery', 'Total: ₱517'])
  })

  it('prints centavos only when there are some', () => {
    const [summary] = buildChatOrderSummary(ctx, view({ lines: [{ name: 'Kape', qty: 1, lineCentavos: 4550 }], totalCentavos: 123450 }))
    expect(textsOf([summary])).toContain('1 × Kape · ₱45.50')
    expect(textsOf([summary])).toContain('Total: ₱1,234.50')
  })
})

// Found on the first real send (2026-11-15): the register's order went out as
// "1 × QA Iced Coffee · ₱175" with nothing about the 16 oz and the extra shot.
describe('what a line says the customer chose', () => {
  it('reads a register line: sizes and add-ons live in variation_selections', () => {
    expect(chatOrderLineDetail({
      variation: null,
      addons: [],
      variation_selections: [
        { typeName: 'Options', optionName: '16 oz', priceAdjustment: 30 },
        { typeName: 'Add-ons', optionName: 'Extra shot ×2', priceAdjustment: 25 },
      ],
      special_instructions: 'less ice',
    })).toBe('16 oz · Extra shot ×2 · less ice')
  })

  it('reads a web checkout line: variation text and add-on labels', () => {
    expect(chatOrderLineDetail({ variation: 'Large', addons: ['Fried Rice ×2', { name: 'Egg', quantity: 2 }], variation_selections: null }))
      .toBe('Large · Fried Rice ×2 · Egg ×2')
  })

  it('says nothing for a plain dish, and survives junk', () => {
    expect(chatOrderLineDetail({ variation: null, addons: null, variation_selections: null, special_instructions: null })).toBe('')
    expect(chatOrderLineDetail({ variation: '  ', addons: [null, 7, { name: 3 }], variation_selections: [null, 'x', { optionName: 4 }, { optionName: ' ' }] }))
      .toBe('')
  })
})

describe('runChatOrder', () => {
  it('sends the summary once, puts the customer on the order and logs one line', async () => {
    const h = harness()
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].psid).toBe(PSID)
    expect(h.sent[0].messages).toHaveLength(2)
    expect(h.attached).toEqual([PSID])
    expect(h.recorded).toEqual([{ outcome: 'sent', isWaiting: true }])
    expect(h.logged.map((line) => line.body)).toEqual(['🧾 Sent order #07 to confirm · ₱518'])
    // The chat is looked up inside the ORDER's store, whatever the register named.
    expect(h.sessionReads).toEqual([{ tenantId: 't1', sessionId: SESSION_ID }])
  })

  it('does nothing for an order that names no chat, or one that is gone', async () => {
    const plain = harness({ order: row({ sessionId: null }) })
    expect(await runChatOrder(ORDER_ID, plain.deps)).toEqual({ outcome: 'not_a_chat_order' })
    const missing = harness({ order: null })
    expect(await runChatOrder(ORDER_ID, missing.deps)).toEqual({ outcome: 'not_found' })
    expect([...plain.sent, ...missing.sent, ...plain.recorded, ...missing.recorded]).toEqual([])
  })

  it('a second call for the same order sends nothing', async () => {
    const h = harness({ claimed: true })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'duplicate' })
    expect(h.sent).toEqual([])
    expect(h.attached).toEqual([])
  })

  it('a replayed call ends at the claim, before any waiting for dishes', async () => {
    const h = harness({ claimed: true, order: row({ lines: [] }) })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'duplicate' })
    expect(h.waits()).toBe(0)
  })

  it('waits for dishes the register is still writing, once claimed', async () => {
    const h = harness({ order: row({ lines: [] }) })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.waits()).toBe(1)
    expect(textsOf(h.sent[0].messages)).toContain('Chicken Inasal')
    const never = harness({ order: row({ lines: [] }), afterWaiting: row({ lines: [] }) })
    expect(await runChatOrder(ORDER_ID, never.deps)).toEqual({ outcome: 'no_items' })
  })

  it('never waits when the dishes are already there', async () => {
    const h = harness()
    await runChatOrder(ORDER_ID, h.deps)
    expect(h.waits()).toBe(0)
  })

  it('a chat of another store (or a made-up id) gets nothing and no customer is attached', async () => {
    const h = harness({ session: false })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'no_session' })
    expect(h.sent).toEqual([])
    expect(h.attached).toEqual([])
    expect(h.recorded).toEqual([{ outcome: 'no_session', isWaiting: false }])
  })

  it('outside Meta\'s 24 hours nothing is sent, but the customer is still on the order', async () => {
    const h = harness({ lastInboundAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'outside_window' })
    expect(h.sent).toEqual([])
    expect(h.attached).toEqual([PSID])
    expect(h.recorded).toEqual([{ outcome: 'outside_window', isWaiting: false }])
  })

  it('a customer who never wrote is outside the window', () => {
    expect(isInsideWindow(null, NOW)).toBe(false)
    expect(isInsideWindow(new Date(NOW.getTime() - 23 * 60 * 60 * 1000), NOW)).toBe(true)
  })

  it.each([
    ['a store on another order backend', { store: store({ isPlatformOrders: false }) }, 'not_platform'],
    ['a store that cannot be read', { store: null }, 'no_store'],
    ['a store with no Page', { store: store({ facebookPageRowId: null }) }, 'no_page'],
    ['a Page without a usable token', { token: null }, 'no_page'],
    ['an order cancelled meanwhile', { order: row({ status: 'cancelled' }) }, 'not_waiting'],
    ['an order whose dishes never arrived', { order: row({ lines: [] }), afterWaiting: row({ lines: [] }) }, 'no_items'],
    ['a chat that already got six summaries this hour', { recent: MAX_SUMMARIES_PER_HOUR }, 'too_many'],
  ] as const)('%s: nothing is sent', async (_name, options, outcome) => {
    const h = harness(options)
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome })
    expect(h.sent).toEqual([])
    expect(h.recorded).toEqual([{ outcome, isWaiting: false }])
  })

  it('a refused send is recorded as failed and nothing is logged as sent', async () => {
    const h = harness({ sendOk: false })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'send_failed' })
    expect(h.recorded).toEqual([{ outcome: 'send_failed', isWaiting: false }])
    expect(h.logged).toEqual([])
  })

  it('an order staff already pushed through still gets its summary, but is not marked waiting', async () => {
    const h = harness({ order: row({ status: 'confirmed' }) })
    expect(await runChatOrder(ORDER_ID, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.recorded).toEqual([{ outcome: 'sent', isWaiting: false }])
  })
})

describe('what the customer reads after a tap', () => {
  const reply = (result: ChatOrderTapResult) => buildChatOrderTapReply(ctx, result)

  it('confirmed, one way to pay: thanks, then that method\'s payment line', () => {
    const messages = reply({ kind: 'confirmed', order: view({ status: 'confirmed', hasPaymentMethod: true }), methods: [gcash], chosen: gcash })
    expect(textsOf(messages)).toBe([
      '✅ Thank you, Ana! Your order #07 is confirmed.',
      '---',
      '💳 GCash\n0917 123 4567 · Karamotan Grill\nTotal: ₱518\nIf you pay ahead, please send the proof of payment here.',
    ].join('\n'))
  })

  it('confirmed, several ways to pay: asks, with one quick reply per method', () => {
    const messages = reply({ kind: 'confirmed', order: view({ status: 'confirmed' }), methods: [gcash, cash], chosen: null })
    expect(messages).toHaveLength(2)
    const ask = messages[1]
    expect(textsOf([ask])).toBe('How would you like to pay ₱518?')
    expect(ask.quickReplies?.map((quick) => quick.title)).toEqual(['GCash', 'Cash on pickup'])
    expect(decodePayload(ask.quickReplies?.[0].payload ?? '')).toEqual({ verb: 'order_pay', orderId: ORDER_ID, methodId: METHOD_ID })
  })

  it('a method without details leaves that line out', () => {
    const messages = reply({ kind: 'paid_with', order: view({ status: 'confirmed' }), method: cash })
    expect(textsOf(messages)).toBe('💳 Cash on pickup\nTotal: ₱518\nIf you pay ahead, please send the proof of payment here.')
  })

  it('a paid order, or a store with no payment methods, is only thanked', () => {
    expect(reply({ kind: 'confirmed', order: view({ isPaid: true }), methods: [gcash, cash], chosen: null })).toHaveLength(1)
    expect(reply({ kind: 'confirmed', order: view(), methods: [], chosen: null })).toHaveLength(1)
  })

  it('a second Confirm says so and does not ask how to pay again once a method is on the order', () => {
    const messages = reply({ kind: 'already', order: view({ status: 'preparing', hasPaymentMethod: true }), methods: [gcash, cash], chosen: null })
    expect(textsOf(messages)).toBe('👍 Your order #07 is already confirmed.')
  })

  it('a cancelled or unknown order, a change, and a method that is gone all get an answer', () => {
    expect(textsOf(reply({ kind: 'gone' }))).toContain('no longer open')
    expect(textsOf(reply({ kind: 'retry' }))).toContain('tap the button again')
    // An edited order: say so, then the NEW summary with its own buttons.
    const updated = reply({ kind: 'updated', order: view({ revision: 1, totalCentavos: 61800 }) })
    expect(textsOf(updated)).toContain('Your order #07 was changed')
    expect(textsOf(updated)).toContain('Total: ₱618')
    expect(updated[updated.length - 1].kind).toBe('buttons')
    expect(textsOf(reply({ kind: 'change', order: view() }))).toContain('Tell us here what to change')
    const again = reply({ kind: 'pick_again', order: view({ hasPaymentMethod: true }), methods: [gcash, cash] })
    expect(again[0].quickReplies).toHaveLength(2)
    expect(reply({ kind: 'pick_again', order: view(), methods: [] })).toHaveLength(1)
  })

  it('never offers more quick replies than Meta takes, and clips long names', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ id: METHOD_ID, name: `Bank transfer number ${index} of the store`, details: '' }))
    const [, ask] = reply({ kind: 'confirmed', order: view(), methods: many, chosen: null })
    expect(ask.quickReplies).toHaveLength(MESSENGER_LIMITS.quickReplies)
    for (const quick of ask.quickReplies ?? []) expect(charLength(quick.title)).toBeLessThanOrEqual(MESSENGER_LIMITS.quickReplyTitle)
  })

  it('only a Change tap hands the chat to staff', () => {
    expect(tapPausesBot({ kind: 'change', order: view() })).toBe(true)
    expect(tapPausesBot({ kind: 'gone' })).toBe(false)
    expect(tapPausesBot({ kind: 'confirmed', order: view(), methods: [], chosen: null })).toBe(false)
  })
})

describe('chat-order payloads', () => {
  it('round-trip, and nothing else is a chat-order tap', () => {
    const taps = [
      { verb: 'order_ok', orderId: ORDER_ID },
      { verb: 'order_ok', orderId: ORDER_ID, revision: 3 },
      { verb: 'order_change', orderId: ORDER_ID },
      { verb: 'order_pay', orderId: ORDER_ID, methodId: METHOD_ID },
    ] as const
    for (const tap of taps) {
      expect(decodePayload(encodePayload(tap))).toEqual(tap)
      expect(isChatOrderTap(decodePayload(encodePayload(tap)))).toBe(true)
    }
    expect(isChatOrderTap(decodePayload(encodePayload({ verb: 'orders' })))).toBe(false)
    expect(isChatOrderTap(null)).toBe(false)
  })

  it('the Confirm button carries the order\'s revision; a broken one is refused', () => {
    const [, ask] = buildChatOrderSummary(ctx, view({ revision: 2 }))
    if (ask.kind !== 'buttons' || ask.buttons[0].type !== 'postback') throw new Error('expected a postback')
    expect(decodePayload(ask.buttons[0].payload)).toEqual({ verb: 'order_ok', orderId: ORDER_ID, revision: 2 })
    expect(decodePayload(`wn1|oc|${ORDER_ID}|x`)).toBeNull()
    expect(decodePayload(`wn1|oc|${ORDER_ID}|2|3`)).toBeNull()
  })

  it('refuse ids that are not ids', () => {
    expect(decodePayload('wn1|oc|not-an-id')).toBeNull()
    expect(decodePayload(`wn1|oc|${ORDER_ID}|extra`)).toBeNull()
    expect(decodePayload(`wn1|op|${ORDER_ID}`)).toBeNull()
    expect(decodePayload(`wn1|op|${ORDER_ID}|'; drop table orders;--`)).toBeNull()
  })
})
