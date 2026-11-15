import { handleStaffChat, type StaffChatDeps } from '@/lib/messenger/staff-chat-handler'
import type { StaffChatFacts } from '@/lib/messenger/staff-chat-deps'
import type { StaffChatBody } from '@/lib/messenger/staff-chat'
import { DEFAULT_SETTINGS } from '@/lib/messenger/settings'
import type { OutgoingMessage } from '@/lib/messenger/graph-message'
import { sampleStore } from './sample-store'

const NOW = new Date('2026-11-15T06:00:00Z')
const HOUR = 60 * 60 * 1000
const TENANT = '11111111-1111-4111-8111-111111111111'
const SESSION = '22222222-2222-4222-8222-222222222222'
const ORDER = '33333333-3333-4333-8333-333333333333'
const CALLER = { userId: 'staff-joy' }
const MENU: OutgoingMessage[] = [{ kind: 'text', text: 'Here is our menu' }]

function facts(extra: { lastInboundAt?: Date | null; pausedUntil?: Date | null; platform?: boolean; page?: string | null; takeover?: number; withOrder?: boolean } = {}): StaffChatFacts {
  return {
    bundle: {
      tenantId: TENANT, slug: 'sample-demo', facebookPageRowId: extra.page === undefined ? 'page-row' : extra.page,
      isPlatformOrders: extra.platform ?? true, store: sampleStore(), rules: [],
      settings: { ...DEFAULT_SETTINGS, takeoverMinutes: extra.takeover ?? 60 },
    },
    session: {
      id: SESSION, psid: '1234567890', firstName: 'John',
      lastInboundAt: extra.lastInboundAt === undefined ? new Date(NOW.getTime() - HOUR) : extra.lastInboundAt,
      botPausedUntil: extra.pausedUntil ?? null,
    },
    cart: null,
    order: extra.withOrder
      ? { id: ORDER, label: '#03', status: 'preparing', isPaid: false, isChatOrder: false, payMethodCount: 2, orderTypeId: null, orderType: 'Pickup', totalCentavos: 25500 }
      : null,
  }
}

function makeDeps(state: StaffChatFacts | null = facts(), overrides: Partial<StaffChatDeps> = {}) {
  const deps = {
    now: () => NOW,
    canReadChat: jest.fn(async () => true),
    loadFacts: jest.fn(async () => state),
    buildCard: jest.fn(async () => MENU),
    pageToken: jest.fn(async () => 'page-token'),
    claimSend: jest.fn(async () => true),
    releaseSend: jest.fn(async () => undefined),
    send: jest.fn(async (_token: string, _psid: string, messages: readonly OutgoingMessage[]) => ({ ok: true as const, sent: messages.length, messageIds: ['m.1'] })),
    setBotPause: jest.fn(async () => true),
    writeLog: jest.fn(async () => undefined),
    clearNeedsReply: jest.fn(async () => undefined),
    reopenChatOrder: jest.fn(async () => undefined),
    ...overrides,
  }
  return deps
}

const text = (value = 'Ready na po!'): StaffChatBody => ({ action: 'send_text', tenantId: TENANT, sessionId: SESSION, clientId: 'tap-000001', text: value })
const card = (name: 'menu' | 'cart' | 'pay', orderId?: string): StaffChatBody =>
  ({ action: 'send_card', tenantId: TENANT, sessionId: SESSION, clientId: 'tap-000002', card: name, ...(orderId ? { orderId } : {}) })

describe('handleStaffChat: who and where', () => {
  it('answers 404 when the caller cannot read the chat, without loading or sending anything', async () => {
    const deps = makeDeps(facts(), { canReadChat: jest.fn(async () => false) })
    const result = await handleStaffChat(text(), CALLER, deps)
    expect(result.status).toBe(404)
    expect(deps.loadFacts).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('refuses stores off WebNegosyo orders and stores without a Page', async () => {
    expect((await handleStaffChat(text(), CALLER, makeDeps(facts({ platform: false })))).body.reason).toBe('not_platform')
    expect((await handleStaffChat(text(), CALLER, makeDeps(facts({ page: null })))).body.reason).toBe('no_page')
  })

  it('refuses after 24 hours and offers no chips then', async () => {
    const late = facts({ lastInboundAt: new Date(NOW.getTime() - 25 * HOUR) })
    const deps = makeDeps(late)
    expect((await handleStaffChat(text(), CALLER, deps)).body.reason).toBe('window_closed')
    expect(deps.send).not.toHaveBeenCalled()
    const tools = await handleStaffChat({ action: 'tools', tenantId: TENANT, sessionId: SESSION }, CALLER, makeDeps(late))
    expect(tools.body).toMatchObject({ window: { isOpen: false }, chips: [] })
  })
})

describe('handleStaffChat: typed replies', () => {
  it('sends, logs the line under the staff account, and pauses the bot for the takeover time', async () => {
    const deps = makeDeps()
    const result = await handleStaffChat(text(), CALLER, deps)
    expect(result).toEqual({ status: 200, body: { status: 'sent', pausedUntil: '2026-11-15T07:00:00.000Z' } })
    expect(deps.send).toHaveBeenCalledWith('page-token', '1234567890', [{ kind: 'text', text: 'Ready na po!' }])
    expect(deps.writeLog).toHaveBeenCalledWith({
      tenantId: TENANT, sessionId: SESSION,
      lines: [expect.objectContaining({ direction: 'staff', body: 'Ready na po!', mid: 'm.1', sentBy: 'staff-joy' })],
    })
    expect(deps.setBotPause).toHaveBeenCalledWith(SESSION, new Date('2026-11-15T07:00:00.000Z'))
    expect(deps.clearNeedsReply).toHaveBeenCalledWith(SESSION)
  })

  it('does not pause a store set to never pause', async () => {
    const deps = makeDeps(facts({ takeover: 0 }))
    await handleStaffChat(text(), CALLER, deps)
    expect(deps.setBotPause).not.toHaveBeenCalled()
  })

  it('sends a repeated tap once', async () => {
    const deps = makeDeps(facts(), { claimSend: jest.fn(async () => false) })
    const result = await handleStaffChat(text(), CALLER, deps)
    expect(result).toEqual({ status: 200, body: { status: 'already_sent' } })
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('gives the tap back when Meta took nothing, so a retry can go', async () => {
    const deps = makeDeps(facts(), { send: jest.fn(async () => ({ ok: false as const, sent: 0, error: { code: 10 } })) })
    const result = await handleStaffChat(text(), CALLER, deps)
    expect(result.body.reason).toBe('send_failed')
    expect(deps.releaseSend).toHaveBeenCalledWith(SESSION, 'tap-000001')
    expect(deps.writeLog).not.toHaveBeenCalled()
    expect(deps.setBotPause).not.toHaveBeenCalled()
    expect(deps.clearNeedsReply).not.toHaveBeenCalled()
  })

  it('still reports sent when only the log line fails', async () => {
    const deps = makeDeps(facts(), { writeLog: jest.fn(async () => { throw new Error('db down') }) })
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await handleStaffChat(text(), CALLER, deps)).body.status).toBe('sent')
  })
})

describe('handleStaffChat: quick actions', () => {
  it('sends an offered card without pausing the bot, logged as the staff account', async () => {
    const deps = makeDeps()
    const result = await handleStaffChat(card('menu'), CALLER, deps)
    expect(result).toEqual({ status: 200, body: { status: 'sent' } })
    expect(deps.setBotPause).not.toHaveBeenCalled()
    expect(deps.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({ direction: 'bot', mid: 'm.1', sentBy: 'staff-joy' })],
    }))
  })

  it('refuses a card the chat does not offer (no cart, other order)', async () => {
    const deps = makeDeps(facts({ withOrder: true }))
    expect((await handleStaffChat(card('cart'), CALLER, deps)).body.reason).toBe('not_offered')
    expect((await handleStaffChat(card('pay', '44444444-4444-4444-8444-444444444444'), CALLER, deps)).body.reason).toBe('not_offered')
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('refuses when the card comes out empty', async () => {
    const deps = makeDeps(facts(), { buildCard: jest.fn(async () => []) })
    expect((await handleStaffChat(card('menu'), CALLER, deps)).body.reason).toBe('nothing_to_send')
  })

  it('previews without sending or claiming', async () => {
    const deps = makeDeps(facts({ withOrder: true }))
    const result = await handleStaffChat({ action: 'preview', tenantId: TENANT, sessionId: SESSION, card: 'pay', orderId: ORDER }, CALLER, deps)
    expect(result).toEqual({ status: 200, body: { messages: MENU } })
    expect(deps.claimSend).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('lists what can be sent now', async () => {
    const result = await handleStaffChat({ action: 'tools', tenantId: TENANT, sessionId: SESSION }, CALLER, makeDeps(facts({ withOrder: true })))
    expect(result.body).toMatchObject({
      blocked: null,
      window: { isOpen: true, endsAt: '2026-11-16T05:00:00.000Z' },
      bot: { enabled: true, pausedUntil: null, takeoverMinutes: 60 },
      cart: null,
      order: { id: ORDER, label: '#03', status: 'preparing', isPaid: false },
    })
    expect((result.body.chips as Array<{ card: string }>).map((chip) => chip.card)).toEqual(['menu', 'categories', 'order_status', 'pay', 'hours'])
  })
})

describe('handleStaffChat: bot switch', () => {
  it('pauses for the takeover time and resumes', async () => {
    const deps = makeDeps(facts({ takeover: 30 }))
    expect((await handleStaffChat({ action: 'bot', tenantId: TENANT, sessionId: SESSION, pause: true }, CALLER, deps)).body)
      .toEqual({ pausedUntil: '2026-11-15T06:30:00.000Z' })
    expect((await handleStaffChat({ action: 'bot', tenantId: TENANT, sessionId: SESSION, pause: false }, CALLER, deps)).body)
      .toEqual({ pausedUntil: null })
    expect(deps.setBotPause).toHaveBeenLastCalledWith(SESSION, null)
  })

  it('pauses an hour on a store that never pauses by itself', async () => {
    const deps = makeDeps(facts({ takeover: 0 }))
    expect((await handleStaffChat({ action: 'bot', tenantId: TENANT, sessionId: SESSION, pause: true }, CALLER, deps)).body)
      .toEqual({ pausedUntil: '2026-11-15T07:00:00.000Z' })
  })

  it('reports a pause that was not stored', async () => {
    const deps = makeDeps(facts(), { setBotPause: jest.fn(async () => false) })
    expect((await handleStaffChat({ action: 'bot', tenantId: TENANT, sessionId: SESSION, pause: true }, CALLER, deps)).status).toBe(500)
  })
})
