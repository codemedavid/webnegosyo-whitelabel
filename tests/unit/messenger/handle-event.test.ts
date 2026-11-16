import { decideReply, handleEvent, readStaffCommand, type WebhookDeps } from '@/lib/messenger/handle-event'
import type { InboundEvent } from '@/lib/messenger/events'
import { DEFAULT_SETTINGS, type StoreBundle } from '@/lib/messenger/settings'
import { DEFAULT_RULES, type MessengerRule } from '@/lib/messenger/rules'
import { encodePayload } from '@/lib/messenger/payload'
import { hashTesterCode } from '@/lib/messenger/tester'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { applyCartOp, priceChatCart, type CartOp, type ChatCartLine } from '@/lib/messenger/chat-cart'
import type { ReplyOrder } from '@/lib/messenger/order-view'
import type { ChatLogLine } from '@/lib/messenger/chat-log'
import type { ChatOrderTap, ChatOrderTapResult } from '@/lib/messenger/chat-order'
import { NOW, sampleStore } from './sample-store'

const PAGE = 'page-1'
const PSID = 'psid-1'
const TENANT = 'tenant-1'
const OUR_APP = '1346321933462152'

function bundle(overrides: Partial<StoreBundle> = {}): StoreBundle {
  return { tenantId: TENANT, slug: 'karamotan', facebookPageRowId: 'row', isPlatformOrders: true, store: sampleStore(), rules: [...DEFAULT_RULES], settings: DEFAULT_SETTINGS, ...overrides }
}

function harness(options: {
  bundle?: StoreBundle | null; pausedUntil?: Date | null; seen?: boolean; page?: boolean; testerAllowed?: boolean
  cart?: ChatCartLine[]; cartUnreadable?: boolean; orders?: ReplyOrder[]
  firstName?: string | null; profileFetchedAt?: Date | null; fetchedName?: string | null; profileThrows?: boolean
  tapResult?: ChatOrderTapResult; tapThrows?: boolean
  testerCode?: { hash: string | null; expiresAt: Date | null }
} = {}) {
  const testerReads: string[] = []
  const taps: Array<{ tenantId: string; psid: string; tap: ChatOrderTap }> = []
  const alerts: Array<{ reason: string; sessionId: string; text: string }> = []
  const cleared: string[] = []
  const logs: Array<{ sessionId: string; lines: readonly ChatLogLine[] }> = []
  const profileFetches: string[] = []
  let cart: ChatCartLine[] = options.cart ?? []
  const cartOps: Array<CartOp | null> = []
  const orderReads: string[] = []
  const sent: Array<{ psid: string; messages: readonly OutgoingMessage[] }> = []
  const pauses: Array<Date | null> = []
  const touches: Array<{ isInbound: boolean }> = []
  const referrals: string[] = []
  const linked: string[] = []
  const deps: WebhookDeps = {
    ourAppId: OUR_APP,
    botMetadata: 'wn',
    now: () => NOW,
    claimOnce: async () => !options.seen,
    findPage: async () => (options.page === false ? null : { tenantId: TENANT, token: 'page-token' }),
    loadBundle: async () => (options.bundle === undefined ? bundle() : options.bundle),
    loadTakeoverMinutes: async () => (options.bundle === undefined ? bundle() : options.bundle)?.settings.takeoverMinutes ?? 60,
    allowTesterAttempt: async () => options.testerAllowed ?? true,
    loadTesterCode: async (tenantId) => {
      testerReads.push(tenantId)
      if (options.testerCode) return options.testerCode
      const settings = (options.bundle === undefined ? bundle() : options.bundle)?.settings
      return { hash: settings?.testerCodeHash ?? null, expiresAt: settings?.testerCodeExpiresAt ?? null }
    },
    touchSession: async (input) => {
      touches.push({ isInbound: input.isInbound })
      return {
        id: '0b0c9d3c-1111-4000-8000-000000000001', botPausedUntil: options.pausedUntil ?? null,
        firstName: options.firstName ?? null, profileFetchedAt: options.profileFetchedAt === undefined ? NOW : options.profileFetchedAt,
      }
    },
    setBotPause: async (_id, until) => { pauses.push(until); return true },
    send: async (_token, psid, messages) => { sent.push({ psid, messages }); return { ok: true, sent: messages.length } },
    answerOrderReferral: async ({ orderId }) => { referrals.push(orderId); return { outcome: 'sent' } },
    createLinkToken: () => 'mt1.TOKEN',
    linkTester: async (_tenant, psid) => { linked.push(psid); return true },
    changeCart: async ({ op, store }) => {
      cartOps.push(op)
      if (options.cartUnreadable) return null
      const applied = op ? applyCartOp(cart, op, store) : { cart, outcome: undefined }
      const priced = priceChatCart(applied.cart, store)
      cart = priced.kept
      return { priced, outcome: applied.outcome }
    },
    loadRecentOrders: async ({ psid }) => { orderReads.push(psid); return options.orders ?? [] },
    logChat: async ({ sessionId, lines }) => { logs.push({ sessionId, lines }) },
    refreshProfile: async ({ psid }) => {
      profileFetches.push(psid)
      if (options.profileThrows) throw new Error('graph down')
      return options.fetchedName ?? null
    },
    applyChatOrderTap: async ({ tenantId, psid, tap }) => {
      taps.push({ tenantId, psid, tap })
      if (options.tapThrows) throw new Error('db down')
      return options.tapResult ?? { kind: 'gone' }
    },
    alertStaff: async (input) => { alerts.push(input) },
    clearNeedsReply: async (sessionId) => { cleared.push(sessionId) },
  }
  return { deps, testerReads, alerts, cleared, taps, sent, pauses, touches, referrals, linked, cartOps, orderReads, logs, profileFetches, cart: () => cart }
}

const base = { pageId: PAGE, psid: PSID, timestamp: 1, dedupeKey: 'mid:1' }
const text = (value: string): InboundEvent => ({ ...base, kind: 'text', text: value })
const postback = (payload: string): InboundEvent => ({ ...base, kind: 'postback', payload, title: 'x' })
const echo = (value: string, appId: string | null, metadata: string | null = null): InboundEvent => ({ ...base, kind: 'echo', text: value, appId, metadata })

describe('handleEvent', () => {
  it('answers a menu keyword with the menu card, links signed', async () => {
    const h = harness()
    expect(await handleEvent(text('menu po'), h.deps)).toBe('replied')
    expect(h.sent).toHaveLength(1)
    expect(JSON.stringify(h.sent[0].messages)).toContain('/menu?m=mt1.TOKEN')
    expect(h.touches).toEqual([{ isInbound: true }])
  })

  it('a Meta retry is answered once', async () => {
    const h = harness({ seen: true })
    expect(await handleEvent(text('menu'), h.deps)).toBe('duplicate')
    expect(h.sent).toEqual([])
  })

  it('a Page that is not connected gets nothing', async () => {
    const h = harness({ page: false })
    expect(await handleEvent(text('menu'), h.deps)).toBe('unknown_page')
    expect(h.sent).toEqual([])
  })

  it('small talk gets no reply (no fallback by default)', async () => {
    const h = harness()
    expect(await handleEvent(text('salamat!'), h.deps)).toBe('no_match')
    expect(h.sent).toEqual([])
  })

  it('an ORDER_ referral goes to the order flow, never to the rules', async () => {
    const h = harness()
    expect(await handleEvent({ ...base, kind: 'referral', ref: 'ORDER_abc_1793730000000' }, h.deps)).toBe('referral')
    expect(h.referrals).toEqual(['abc'])
    expect(h.sent).toEqual([])
  })

  it('any other referral greets like Get Started', async () => {
    const h = harness()
    expect(await handleEvent({ ...base, kind: 'referral', ref: 'from-ad' }, h.deps)).toBe('replied')
  })

  it('the bot switched off stays quiet', async () => {
    const h = harness({ bundle: bundle({ settings: { ...DEFAULT_SETTINGS, botEnabled: false } }) })
    expect(await handleEvent(text('menu'), h.deps)).toBe('bot_off')
    expect(h.sent).toEqual([])
  })

  describe('staff takeover', () => {
    it('our own echo (app id or metadata) is ignored', async () => {
      const h = harness()
      expect(await handleEvent(echo('📍 Karamotan', OUR_APP), h.deps)).toBe('own_echo')
      expect(await handleEvent(echo('📍 Karamotan', '999', 'wn'), h.deps)).toBe('own_echo')
      expect(h.pauses).toEqual([])
    })

    it('a staff reply from Page Inbox pauses the bot for the setting', async () => {
      const h = harness()
      expect(await handleEvent(echo('Hi! Yes we have sisig', '263902037430900'), h.deps)).toBe('staff_paused')
      expect(h.pauses).toEqual([new Date(NOW.getTime() + 60 * 60 * 1000)])
      expect(h.touches).toEqual([{ isInbound: false }])
      expect(h.sent).toEqual([])
    })

    it('staff typing "here is our menu" no longer sends a card (D3)', async () => {
      const h = harness()
      expect(await handleEvent(echo('here is our menu', '263902037430900'), h.deps)).toBe('staff_paused')
      expect(h.sent).toEqual([])
    })

    it('a staff slash command sends its card and does not pause', async () => {
      const h = harness()
      expect(await handleEvent(echo('/menu', '263902037430900'), h.deps)).toBe('staff_command')
      expect(h.sent[0].messages[0].kind).toBe('cards')
      expect(h.pauses).toEqual([])
    })

    it('takeover set to 0 never pauses', async () => {
      const h = harness({ bundle: bundle({ settings: { ...DEFAULT_SETTINGS, takeoverMinutes: 0 } }) })
      expect(await handleEvent(echo('hello', null), h.deps)).toBe('staff_ignored')
      expect(h.pauses).toEqual([])
    })

    it('while paused, typed messages wait for staff; button taps still answer', async () => {
      const h = harness({ pausedUntil: new Date(NOW.getTime() + 1000) })
      expect(await handleEvent(text('menu'), h.deps)).toBe('paused')
      expect(await handleEvent(postback(encodePayload({ verb: 'categories' })), h.deps)).toBe('replied')
      expect(h.sent).toHaveLength(1)
    })

    it('a pause that ran out is over', async () => {
      const h = harness({ pausedUntil: new Date(NOW.getTime() - 1000) })
      expect(await handleEvent(text('menu'), h.deps)).toBe('replied')
    })

    it('"talk to staff" pauses the bot after answering', async () => {
      const h = harness()
      expect(await handleEvent(postback(encodePayload({ verb: 'staff' })), h.deps)).toBe('replied')
      expect(h.pauses).toHaveLength(1)
      expect(h.sent[0].messages[0]).toMatchObject({ kind: 'text', text: expect.stringContaining('Karamotan Grill') })
    })

    it('"talk to staff" marks the chat Needs a reply and alerts staff', async () => {
      const h = harness()
      await handleEvent(postback(encodePayload({ verb: 'staff' })), h.deps)
      expect(h.alerts).toEqual([expect.objectContaining({ reason: 'asked', sessionId: '0b0c9d3c-1111-4000-8000-000000000001' })])
    })

    it('a message typed while paused alerts staff, rule or not', async () => {
      for (const words of ['menu', 'salamat po, nasaan na po?']) {
        const h = harness({ pausedUntil: new Date(NOW.getTime() + 60_000) })
        expect(await handleEvent(text(words), h.deps)).toBe('paused')
        expect(h.alerts).toEqual([expect.objectContaining({ reason: 'while_paused', text: words })])
        expect(h.sent).toEqual([])
      }
    })

    it('a button tap while paused answers without alerting anyone', async () => {
      const h = harness({ pausedUntil: new Date(NOW.getTime() + 60_000) })
      expect(await handleEvent(postback(encodePayload({ verb: 'categories' })), h.deps)).toBe('replied')
      expect(h.alerts).toEqual([])
    })

    it('a staff reply in Page Inbox clears Needs a reply', async () => {
      const h = harness()
      await handleEvent(echo('Hi! Yes we have sisig', '263902037430900'), h.deps)
      expect(h.cleared).toEqual(['0b0c9d3c-1111-4000-8000-000000000001'])
    })
  })

  describe('typed orders (T1)', () => {
    // Off by default (a reviewer's "Can I order 1 milktea" then "menu" must get the menu).
    const noticing = () => bundle({
      settings: { ...DEFAULT_SETTINGS, messages: { ...DEFAULT_SETTINGS.messages, toggles: { 'handover.notice_typed_orders': true } } },
    })

    it('is off until the owner switches it on: the automations answer as before', async () => {
      const h = harness()
      expect(await handleEvent(text('pa order po 2 iced tea'), h.deps)).not.toBe('typed_order')
      expect(h.alerts).toEqual([])
      expect(h.pauses).toEqual([])
    })

    it('hands a typed order to staff once switched on: the reply, a pause, an alert', async () => {
      const h = harness({ bundle: noticing() })
      expect(await handleEvent(text('pa order po 2 iced tea'), h.deps)).toBe('typed_order')
      expect(h.sent).toHaveLength(1)
      expect(h.sent[0].messages).toEqual([{ kind: 'text', text: "Got it! We'll check your order and confirm it here shortly. 🙏" }])
      expect(h.pauses).toEqual([new Date(NOW.getTime() + 60 * 60 * 1000)])
      expect(h.alerts).toEqual([expect.objectContaining({ reason: 'typed_order', text: 'pa order po 2 iced tea' })])
    })

    it('leaves questions and plain keywords to the automations', async () => {
      for (const words of ['magkano po iced tea?', 'order', 'menu po']) {
        const h = harness({ bundle: noticing() })
        expect(await handleEvent(text(words), h.deps)).not.toBe('typed_order')
        expect(h.alerts).toEqual([])
      }
    })

    it('says nothing when the bot is off for the store', async () => {
      const h = harness({ bundle: bundle({ settings: { ...DEFAULT_SETTINGS, botEnabled: false } }) })
      expect(await handleEvent(text('pa order po 2 iced tea'), h.deps)).toBe('bot_off')
      expect(h.sent).toEqual([])
    })
  })

  describe('chat cart', () => {
    it('Add to cart stores the dish and answers with the total and Checkout', async () => {
      const h = harness()
      expect(await handleEvent(postback(encodePayload({ verb: 'add', itemId: 'drink-1' })), h.deps)).toBe('replied')
      expect(h.cartOps).toEqual([{ kind: 'add', itemId: 'drink-1' }])
      expect(h.cart()).toEqual([{ itemId: 'drink-1', qty: 1, name: 'Iced Tea' }])
      expect(h.sent[0].messages[0]).toMatchObject({ kind: 'buttons', text: expect.stringContaining('Added Iced Tea') })
      expect(JSON.stringify(h.sent[0].messages)).toContain('/cart?mc=1&m=mt1.TOKEN')
    })

    it('− / + / Remove change the cart and show it again', async () => {
      const h = harness({ cart: [{ itemId: 'drink-1', qty: 2 }] })
      await handleEvent(postback(encodePayload({ verb: 'dec', itemId: 'drink-1' })), h.deps)
      expect(h.cart()).toEqual([{ itemId: 'drink-1', qty: 1, name: 'Iced Tea' }])
      await handleEvent({ ...postback(encodePayload({ verb: 'rm', itemId: 'drink-1' })), dedupeKey: 'mid:2' }, h.deps)
      expect(h.cart()).toEqual([])
      expect(JSON.stringify(h.sent[1].messages)).toContain('Your cart is empty')
    })

    it('typing "cart" shows the cart without changing it; Empty cart asks first', async () => {
      const h = harness({ cart: [{ itemId: 'drink-1', qty: 2 }] })
      expect(await handleEvent(text('my cart po'), h.deps)).toBe('replied')
      expect(h.cartOps).toEqual([null])
      expect(h.sent[0].messages[0].kind).toBe('cards')
      await handleEvent(postback(encodePayload({ verb: 'clear' })), h.deps)
      expect(h.cartOps).toEqual([null])
      expect(h.sent[1].messages[0]).toMatchObject({ kind: 'buttons', text: 'Empty your cart?' })
      await handleEvent(postback(encodePayload({ verb: 'clear_yes' })), h.deps)
      expect(h.cart()).toEqual([])
    })

    it('another store\'s dish id is refused', async () => {
      const h = harness()
      await handleEvent(postback(encodePayload({ verb: 'add', itemId: 'someone-elses-dish' })), h.deps)
      expect(h.cart()).toEqual([])
      expect(JSON.stringify(h.sent[0].messages)).toContain("can't be ordered from the chat")
    })

    it('a cart that can\'t be read says so and offers the menu', async () => {
      const h = harness({ cartUnreadable: true })
      await handleEvent(postback(encodePayload({ verb: 'add', itemId: 'drink-1' })), h.deps)
      expect(JSON.stringify(h.sent[0].messages)).toContain("couldn't open your cart")
    })

    it('cart taps still answer while staff have the bot paused', async () => {
      const h = harness({ pausedUntil: new Date(NOW.getTime() + 60_000) })
      expect(await handleEvent(postback(encodePayload({ verb: 'add', itemId: 'drink-1' })), h.deps)).toBe('replied')
    })
  })

  describe('where is my order', () => {
    const order: ReplyOrder = {
      id: 'o1', label: '#07', status: 'preparing', kind: 'pickup', totalCentavos: 44700,
      trackingUrl: 'https://karamotan.webnegosyo.com/order/o1?t=abc',
    }

    it('lists this customer\'s orders with tracking links (platform store)', async () => {
      const h = harness({ orders: [order] })
      expect(await handleEvent(text('where is my order'), h.deps)).toBe('replied')
      expect(h.orderReads).toEqual([PSID])
      const cards = h.sent[0].messages[1]
      expect(cards).toMatchObject({ kind: 'cards', cards: [{ title: 'Order #07 · Preparing', subtitle: '₱447 · Karamotan Grill' }] })
    })

    it('no recent order: says so', async () => {
      const h = harness({ orders: [] })
      await handleEvent(text('nasaan order ko'), h.deps)
      expect(JSON.stringify(h.sent[0].messages)).toContain("couldn't find a recent order")
    })

    it('a Convex store never reads platform orders and points to the tracking link', async () => {
      const h = harness({ bundle: bundle({ isPlatformOrders: false }), orders: [order] })
      await handleEvent(text('order status'), h.deps)
      expect(h.orderReads).toEqual([])
      expect(JSON.stringify(h.sent[0].messages)).toContain('tracking link on your receipt')
    })
  })

  describe('tester link', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      botEnabled: false,
      testerCodeHash: hashTesterCode(TENANT, '482193'),
      testerCodeExpiresAt: new Date(NOW.getTime() + 60_000),
    }

    it('the right code links this chat, even with the bot off', async () => {
      const h = harness({ bundle: bundle({ settings }) })
      expect(await handleEvent(text('TEST 482193'), h.deps)).toBe('tester_linked')
      expect(h.linked).toEqual([PSID])
    })

    it('guesses are limited per store', async () => {
      const h = harness({ bundle: bundle({ settings }), testerAllowed: false })
      expect(await handleEvent(text('TEST 482193'), h.deps)).toBe('bot_off')
      expect(h.linked).toEqual([])
    })

    it('a wrong or expired code is just a message', async () => {
      const wrong = harness({ bundle: bundle({ settings }) })
      expect(await handleEvent(text('test 000000'), wrong.deps)).toBe('bot_off')
      const expired = harness({ bundle: bundle({ settings: { ...settings, testerCodeExpiresAt: new Date(NOW.getTime() - 1) } }) })
      expect(await handleEvent(text('TEST 482193'), expired.deps)).toBe('bot_off')
      expect([...wrong.linked, ...expired.linked]).toEqual([])
    })

    it('a code made after the store was cached still links: the code is read fresh, not from the bundle', async () => {
      const h = harness({
        bundle: bundle({ settings: { ...DEFAULT_SETTINGS, botEnabled: false } }),
        testerCode: { hash: settings.testerCodeHash, expiresAt: settings.testerCodeExpiresAt },
      })
      expect(await handleEvent(text('TEST 482193'), h.deps)).toBe('tester_linked')
      expect(h.testerReads).toEqual([TENANT])
    })

    it('only a message shaped like a code reads the code', async () => {
      const h = harness()
      await handleEvent(text('menu po'), h.deps)
      await handleEvent(postback(encodePayload({ verb: 'menu' })), h.deps)
      expect(h.testerReads).toEqual([])
    })
  })
})

describe('chat log + customer name', () => {
  const greetRule: MessengerRule = {
    id: '0b0c9d3c-2222-4000-8000-000000000001', name: 'Hello', isEnabled: true,
    trigger: { kind: 'keyword', keywords: ['hello'], match: 'contains' },
    action: { kind: 'text', text: 'Hi {name}! Welcome.', buttons: [] },
  }
  const withGreet = () => bundle({ rules: [greetRule, ...DEFAULT_RULES] })
  const bodies = (h: ReturnType<typeof harness>) => h.logs.flatMap((entry) => entry.lines.map((line) => `${line.direction}:${line.kind}:${line.body}`))

  it('logs what the customer typed and a summary of the reply, once, in order', async () => {
    const h = harness()
    expect(await handleEvent(text('menu po'), h.deps)).toBe('replied')
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0].sessionId).toBe('0b0c9d3c-1111-4000-8000-000000000001')
    const [customer, bot] = h.logs[0].lines
    expect(customer).toMatchObject({ direction: 'in', kind: 'text', body: 'menu po', mid: '1' })
    expect(bot).toMatchObject({ direction: 'bot', kind: 'card', mid: null })
    expect(bot.body).toMatch(/^🗂 Sent: /)
    expect(bot.body).not.toContain('mt1.TOKEN')
    expect(bot.sentAt.getTime()).toBeGreaterThan(customer.sentAt.getTime())
  })

  it('a message the bot does not answer is still logged (staff see what was asked)', async () => {
    for (const [h, outcome] of [[harness(), 'no_match'], [harness({ bundle: bundle({ settings: { ...DEFAULT_SETTINGS, botEnabled: false } }) }), 'bot_off'], [harness({ pausedUntil: new Date(NOW.getTime() + 60_000) }), 'paused']] as const) {
      expect(await handleEvent(text(outcome === 'paused' ? 'menu' : 'salamat po'), h.deps)).toBe(outcome)
      expect(bodies(h)).toEqual([`in:text:${outcome === 'paused' ? 'menu' : 'salamat po'}`])
    }
  })

  it('a photo is logged as "📷 Photo" (no media), a tap as its button title', async () => {
    const h = harness()
    expect(await handleEvent({ ...base, kind: 'other', attachment: 'photo' }, h.deps)).toBe('nothing_to_answer')
    expect(bodies(h)).toEqual(['in:photo:📷 Photo'])
    const tap = harness()
    await handleEvent({ ...base, kind: 'quick_reply', text: '🛒 View cart', payload: encodePayload({ verb: 'cart' }) }, tap.deps)
    expect(bodies(tap)[0]).toBe('in:tap:🛒 View cart')
  })

  it('a failed send logs only the customer line', async () => {
    const h = harness()
    h.deps.send = async () => ({ ok: false, sent: 0, error: { code: 10 } })
    expect(await handleEvent(text('menu'), h.deps)).toBe('send_failed')
    expect(bodies(h)).toEqual(['in:text:menu'])
  })

  it('staff typing in Page Inbox is logged (also with takeover off); our own echoes never are', async () => {
    const staff = harness()
    expect(await handleEvent(echo('Ready na po in 10 mins', null), staff.deps)).toBe('staff_paused')
    expect(bodies(staff)).toEqual(['staff:text:Ready na po in 10 mins'])
    const noTakeover = harness({ bundle: bundle({ settings: { ...DEFAULT_SETTINGS, takeoverMinutes: 0 } }) })
    expect(await handleEvent(echo('ok po', null), noTakeover.deps)).toBe('staff_ignored')
    expect(bodies(noTakeover)).toEqual(['staff:text:ok po'])
    const ours = harness()
    expect(await handleEvent(echo('🍽️ Our menu', OUR_APP, 'wn'), ours.deps)).toBe('own_echo')
    expect(ours.logs).toEqual([])
  })

  it('a staff /menu is logged with the card it sent', async () => {
    const h = harness()
    expect(await handleEvent(echo('/menu', null), h.deps)).toBe('staff_command')
    expect(bodies(h)[0]).toBe('staff:text:/menu')
    expect(bodies(h)[1]).toMatch(/^bot:card:🗂 Sent: /)
  })

  it("the owner's TEST code is never logged", async () => {
    const settings = { ...DEFAULT_SETTINGS, testerCodeHash: hashTesterCode(TENANT, '482193'), testerCodeExpiresAt: new Date(NOW.getTime() + 60_000) }
    const h = harness({ bundle: bundle({ settings }) })
    expect(await handleEvent(text('TEST 482193'), h.deps)).toBe('tester_linked')
    expect(h.logs).toEqual([])
  })

  it('an order referral is logged with the summary it sent', async () => {
    const h = harness()
    expect(await handleEvent({ ...base, kind: 'referral', ref: 'ORDER_0b0c9d3c-3333-4000-8000-000000000001' }, h.deps)).toBe('referral')
    expect(bodies(h)).toEqual(['in:other:↪ Opened the chat from their order', 'bot:text:🧾 Sent the order summary'])
  })

  it('fetches the Messenger name the first time and greets with it', async () => {
    const h = harness({ bundle: withGreet(), profileFetchedAt: null, fetchedName: 'Juan Carlo' })
    expect(await handleEvent(text('hello'), h.deps)).toBe('replied')
    expect(h.profileFetches).toEqual([PSID])
    expect(JSON.stringify(h.sent[0].messages)).toContain('Hi Juan! Welcome.')
  })

  it('a fresh stored name is used without asking Meta again', async () => {
    const h = harness({ bundle: withGreet(), firstName: 'Ana', profileFetchedAt: new Date(NOW.getTime() - 86_400_000) })
    await handleEvent(text('hello'), h.deps)
    expect(h.profileFetches).toEqual([])
    expect(JSON.stringify(h.sent[0].messages)).toContain('Hi Ana! Welcome.')
  })

  it('a failed profile fetch still replies, just without a name', async () => {
    const h = harness({ bundle: withGreet(), profileFetchedAt: null, profileThrows: true })
    expect(await handleEvent(text('hello'), h.deps)).toBe('replied')
    expect(JSON.stringify(h.sent[0].messages)).toContain('Hi! Welcome.')
  })

  it('a failing log write never fails the event', async () => {
    const h = harness()
    h.deps.logChat = async () => { throw new Error('db down') }
    expect(await handleEvent(text('menu'), h.deps)).toBe('replied')
  })
})

describe('decideReply', () => {
  const ice: MessengerRule = {
    id: '0b0c9d3c-1111-4000-8000-0000000000aa', name: 'Hours?', isEnabled: true,
    trigger: { kind: 'ice_breaker', question: 'What are your hours?' }, action: { kind: 'hours_location' },
  }
  const ctx = { store: sampleStore(), linkToken: null }

  it('a starter question runs its rule', () => {
    const decision = decideReply(postback(encodePayload({ verb: 'rule', ruleId: ice.id })), [ice])
    expect(decision?.build(ctx)[0].kind).toBe('buttons')
  })

  it('a removed rule\'s button still answers with the menu card', () => {
    const decision = decideReply(postback(encodePayload({ verb: 'rule', ruleId: '0b0c9d3c-1111-4000-8000-0000000000bb' })), [ice])
    expect(decision?.build(ctx)[0].kind).toBe('cards')
  })

  it('another tool\'s postback is not ours to answer', () => {
    expect(decideReply(postback('GET_STARTED_PAYLOAD'), DEFAULT_RULES)).toBeNull()
  })

  it('a quick reply with a foreign payload falls back to its text', () => {
    const decision = decideReply({ ...base, kind: 'quick_reply', text: 'Menu', payload: 'OTHER_BOT' }, DEFAULT_RULES)
    expect(decision?.isTyped).toBe(true)
  })
})

describe('readStaffCommand', () => {
  it.each([['/menu', 'menu_card'], ['!order', 'menu_card'], ['/categories', 'categories'], ['/hours please', 'hours_location']])('%p', (input, kind) => {
    expect(readStaffCommand(input)?.kind).toBe(kind)
  })
  it.each(['menu', 'see /menu', '/unknown'])('%p is not a command', (input) => {
    expect(readStaffCommand(input)).toBeNull()
  })
})

describe('taps on an order staff rang up for the chat', () => {
  const ORDER_ID = '0b0c9d3c-2222-4000-8000-000000000001'
  const METHOD_ID = '0b0c9d3c-3333-4000-8000-000000000001'
  const order = {
    id: ORDER_ID, label: '#07', status: 'confirmed', orderType: 'Pickup', lines: [], totalCentavos: 51800, isPaid: false, hasPaymentMethod: false,
  }
  const confirmTap = postback(encodePayload({ verb: 'order_ok', orderId: ORDER_ID }))
  const quickReply = (payload: string): InboundEvent => ({ ...base, kind: 'quick_reply', text: 'GCash', payload })

  it('Confirm is applied for the customer who tapped, at the Page\'s own store, and answered', async () => {
    const h = harness({ firstName: 'Ana', tapResult: { kind: 'confirmed', order, methods: [], chosen: null } })
    expect(await handleEvent(confirmTap, h.deps)).toBe('chat_order')
    expect(h.taps).toEqual([{ tenantId: TENANT, psid: PSID, tap: { verb: 'order_ok', orderId: ORDER_ID } }])
    expect(JSON.stringify(h.sent[0].messages)).toContain('Thank you, Ana! Your order #07 is confirmed.')
    expect(h.pauses).toEqual([])
    expect(h.logs[0].lines.map((line) => line.direction)).toEqual(['in', 'bot'])
  })

  it('works with the bot switched off and while staff have it paused: a person sent that order', async () => {
    const off = harness({ bundle: bundle({ settings: { ...DEFAULT_SETTINGS, botEnabled: false } }), tapResult: { kind: 'already', order, methods: [], chosen: null } })
    expect(await handleEvent(confirmTap, off.deps)).toBe('chat_order')
    expect(off.sent).toHaveLength(1)
    const paused = harness({ pausedUntil: new Date(NOW.getTime() + 60_000), tapResult: { kind: 'already', order, methods: [], chosen: null } })
    expect(await handleEvent(confirmTap, paused.deps)).toBe('chat_order')
    expect(paused.sent).toHaveLength(1)
  })

  it('Change answers and hands the chat to staff for at least an hour', async () => {
    const h = harness({ tapResult: { kind: 'change', order } })
    expect(await handleEvent(postback(encodePayload({ verb: 'order_change', orderId: ORDER_ID })), h.deps)).toBe('chat_order')
    expect(JSON.stringify(h.sent[0].messages)).toContain('Tell us here what to change')
    expect(h.pauses).toHaveLength(1)
    expect(h.pauses[0]?.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 60 * 60 * 1000)
    // The bot goes quiet, so staff are told the customer is waiting on a change.
    expect(h.alerts).toEqual([expect.objectContaining({ reason: 'wants_change', text: 'Order #07' })])
  })

  it('a confirmed tap alerts nobody', async () => {
    const h = harness({ tapResult: { kind: 'confirmed', order, methods: [], chosen: null } })
    await handleEvent(confirmTap, h.deps)
    expect(h.alerts).toEqual([])
  })

  it('a payment-method quick reply reaches the order too', async () => {
    const method = { id: METHOD_ID, name: 'GCash', details: '0917 123 4567' }
    const h = harness({ tapResult: { kind: 'paid_with', order, method } })
    expect(await handleEvent(quickReply(encodePayload({ verb: 'order_pay', orderId: ORDER_ID, methodId: METHOD_ID })), h.deps)).toBe('chat_order')
    expect(h.taps[0].tap).toEqual({ verb: 'order_pay', orderId: ORDER_ID, methodId: METHOD_ID })
    expect(JSON.stringify(h.sent[0].messages)).toContain('0917 123 4567')
  })

  it('a failure on our side asks for another tap (the order is still open); a store on another backend is "no longer open"', async () => {
    const broken = harness({ tapThrows: true })
    expect(await handleEvent(confirmTap, broken.deps)).toBe('chat_order')
    expect(JSON.stringify(broken.sent[0].messages)).toContain('tap the button again')
    const convex = harness({ bundle: bundle({ isPlatformOrders: false }), tapResult: { kind: 'confirmed', order, methods: [], chosen: null } })
    expect(await handleEvent(confirmTap, convex.deps)).toBe('chat_order')
    expect(convex.taps).toEqual([])
    expect(JSON.stringify(convex.sent[0].messages)).toContain('no longer open')
  })

  it('a made-up order id never reaches the database', async () => {
    const h = harness()
    expect(await handleEvent(postback('wn1|oc|1 or 1=1'), h.deps)).toBe('no_match')
    expect(h.taps).toEqual([])
    expect(h.sent).toEqual([])
  })

  it('other buttons still go through the rules', async () => {
    const h = harness()
    expect(await handleEvent(postback(encodePayload({ verb: 'menu' })), h.deps)).toBe('replied')
    expect(h.taps).toEqual([])
  })
})
