import { formatCentavos, isPaidStatus } from '@/lib/messenger/money'
import {
  isOfferedCard,
  pauseAfterReply,
  replyWindow,
  staffAppLine,
  staffChatBodySchema,
  staffChips,
  STAFF_TEXT_MAX,
  type StaffOrderFacts,
} from '@/lib/messenger/staff-chat'

const NOW = new Date('2026-11-15T06:00:00Z')
const HOUR = 60 * 60 * 1000
const TENANT = '11111111-1111-4111-8111-111111111111'
const SESSION = '22222222-2222-4222-8222-222222222222'
const ORDER = '33333333-3333-4333-8333-333333333333'

const open = replyWindow(new Date(NOW.getTime() - HOUR), NOW)
const order = (extra: Partial<StaffOrderFacts> = {}): StaffOrderFacts => ({
  id: ORDER, label: '#03', status: 'preparing', isPaid: false, isChatOrder: false, payMethodCount: 1, ...extra,
})

describe('replyWindow', () => {
  it('is open for 24 hours after the customer last wrote, closed after', () => {
    expect(replyWindow(new Date(NOW.getTime() - 23 * HOUR), NOW).isOpen).toBe(true)
    expect(replyWindow(new Date(NOW.getTime() - 24 * HOUR), NOW).isOpen).toBe(false)
    expect(replyWindow(new Date(NOW.getTime() - HOUR), NOW).endsAt?.toISOString()).toBe('2026-11-16T05:00:00.000Z')
  })

  it('is closed when the customer never wrote', () => {
    expect(replyWindow(null, NOW)).toEqual({ isOpen: false, endsAt: null })
  })
})

describe('staffChips', () => {
  const base = { window: open, cartCount: 0, cartTotalCentavos: 0, hasCategories: true, order: null }

  it('offers nothing outside the 24-hour window', () => {
    expect(staffChips({ ...base, window: replyWindow(null, NOW), cartCount: 2, cartTotalCentavos: 25500, order: order() })).toEqual([])
  })

  it('leads with checkout when the customer has a cart', () => {
    const chips = staffChips({ ...base, cartCount: 2, cartTotalCentavos: 25500 })
    expect(chips[0]).toEqual({ card: 'cart', label: 'Send checkout · ₱255' })
    expect(chips.map((chip) => chip.card)).toEqual(['cart', 'menu', 'categories', 'hours'])
  })

  it('skips categories on a menu without any', () => {
    expect(staffChips({ ...base, hasCategories: false }).map((chip) => chip.card)).toEqual(['menu', 'hours'])
  })

  it('offers the status and how to pay for an unpaid chat order', () => {
    const chips = staffChips({ ...base, order: order({ isChatOrder: true }) })
    expect(chips).toContainEqual({ card: 'order_status', label: '#03 Preparing', orderId: ORDER })
    expect(chips).toContainEqual({ card: 'pay', label: 'How to pay', orderId: ORDER })
  })

  it('never offers how to pay for a web order (its pay buttons have no chat order to answer)', () => {
    const chips = staffChips({ ...base, order: order({ isChatOrder: false }) })
    expect(chips).toContainEqual({ card: 'order_status', label: '#03 Preparing', orderId: ORDER })
    expect(chips.map((chip) => chip.card)).not.toContain('pay')
  })

  it('re-sends a waiting chat order instead of a status, and nothing for a waiting web order', () => {
    expect(staffChips({ ...base, order: order({ status: 'pending', isChatOrder: true }) }))
      .toContainEqual({ card: 'summary', label: 'Resend #03', orderId: ORDER })
    const web = staffChips({ ...base, order: order({ status: 'pending', isChatOrder: false }) }).map((chip) => chip.card)
    expect(web).not.toContain('summary')
    expect(web).not.toContain('order_status')
  })

  it('never asks a paid or cancelled order to pay, or an order type without methods', () => {
    for (const extra of [{ isPaid: true }, { status: 'cancelled' as const }, { payMethodCount: 0 }]) {
      expect(staffChips({ ...base, order: order({ isChatOrder: true, ...extra }) }).map((chip) => chip.card)).not.toContain('pay')
    }
  })
})

describe('isOfferedCard', () => {
  const chips = staffChips({ window: open, cartCount: 0, cartTotalCentavos: 0, hasCategories: true, order: order({ isChatOrder: true }) })

  it('accepts an offered card and refuses one that is not', () => {
    expect(isOfferedCard(chips, 'menu', undefined)).not.toBeNull()
    expect(isOfferedCard(chips, 'cart', undefined)).toBeNull()
    expect(isOfferedCard(chips, 'summary', ORDER)).toBeNull()
  })

  it('refuses an order card for a different order', () => {
    expect(isOfferedCard(chips, 'pay', ORDER)).not.toBeNull()
    expect(isOfferedCard(chips, 'pay', '44444444-4444-4444-8444-444444444444')).toBeNull()
  })
})

describe('pauseAfterReply', () => {
  it('pauses for the takeover time', () => {
    expect(pauseAfterReply({ takeoverMinutes: 60, pausedUntil: null, now: NOW })?.toISOString()).toBe('2026-11-15T07:00:00.000Z')
  })

  it('never pauses a store set to 0, and never shortens a longer pause', () => {
    expect(pauseAfterReply({ takeoverMinutes: 0, pausedUntil: null, now: NOW })).toBeNull()
    expect(pauseAfterReply({ takeoverMinutes: 60, pausedUntil: new Date(NOW.getTime() + 3 * HOUR), now: NOW })).toBeNull()
  })
})

describe('staffAppLine', () => {
  it('names who sent it and clips to the log line', () => {
    const line = staffAppLine('x'.repeat(STAFF_TEXT_MAX + 50), { mid: 'm.1', sentBy: 'user-1', now: NOW })
    expect(line).toMatchObject({ direction: 'staff', kind: 'text', mid: 'm.1', sentBy: 'user-1' })
    expect(line.body.length).toBeLessThanOrEqual(STAFF_TEXT_MAX)
  })
})

describe('staffChatBodySchema', () => {
  it('accepts each action', () => {
    for (const body of [
      { action: 'tools', tenantId: TENANT, sessionId: SESSION },
      { action: 'preview', tenantId: TENANT, sessionId: SESSION, card: 'menu' },
      { action: 'send_card', tenantId: TENANT, sessionId: SESSION, clientId: 'abcDEF12_-', card: 'pay', orderId: ORDER },
      { action: 'send_text', tenantId: TENANT, sessionId: SESSION, clientId: 'abcDEF12', text: ' Ready na po! ' },
      { action: 'bot', tenantId: TENANT, sessionId: SESSION, pause: true },
    ]) {
      expect(staffChatBodySchema.safeParse(body).success).toBe(true)
    }
  })

  it('refuses unknown keys, cards, blank or long text and odd ids', () => {
    for (const body of [
      { action: 'tools', tenantId: TENANT, sessionId: SESSION, psid: '123456' },
      { action: 'preview', tenantId: TENANT, sessionId: SESSION, card: 'text' },
      { action: 'send_text', tenantId: TENANT, sessionId: SESSION, clientId: 'abcDEF12', text: '   ' },
      { action: 'send_text', tenantId: TENANT, sessionId: SESSION, clientId: 'abcDEF12', text: 'x'.repeat(STAFF_TEXT_MAX + 1) },
      { action: 'send_text', tenantId: TENANT, sessionId: SESSION, clientId: 'short', text: 'hi' },
      { action: 'send_card', tenantId: TENANT, sessionId: 'not-a-uuid', clientId: 'abcDEF12', card: 'menu' },
    ]) {
      expect(staffChatBodySchema.safeParse(body).success).toBe(false)
    }
  })
})

describe('money', () => {
  it('drops centavos only when whole', () => {
    expect(formatCentavos(25500)).toBe('₱255')
    expect(formatCentavos(12299)).toBe('₱122.99')
    expect(formatCentavos(150000)).toBe('₱1,500')
  })

  it('counts a verified payment as paid, a failed one as still owing', () => {
    expect(isPaidStatus('paid')).toBe(true)
    expect(isPaidStatus('verified')).toBe(true)
    expect(isPaidStatus('pending')).toBe(false)
    expect(isPaidStatus('failed')).toBe(false)
    expect(isPaidStatus(null)).toBe(false)
  })
})
