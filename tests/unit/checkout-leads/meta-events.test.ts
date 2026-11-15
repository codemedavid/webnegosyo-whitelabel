/**
 * The funnel's server-side Meta events. A Lead carries the browser's signals,
 * clipped; a Purchase goes out ONCE, when staff first mark a browser lead
 * paid, and a send that failed gives its claim back for the next try.
 */
import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals'

const sendMetaConversionEvent = jest.fn<(...args: unknown[]) => Promise<unknown>>()
jest.mock('@/lib/meta-conversions', () => ({
  sendMetaConversionEvent: (...args: unknown[]) => sendMetaConversionEvent(...args),
}))

// next/jest leaves static imports ahead of jest.mock, so load lazily.
const load = () => import('@/lib/checkout-leads/meta-events')

interface Call {
  patch: Record<string, unknown>
  filters: Array<[string, string, unknown]>
}

/** Records every UPDATE; the claim answers `claimRow` (null = nothing matched). */
function fakeAdmin(claimRow: Record<string, unknown> | null) {
  const calls: Call[] = []
  const admin = {
    from: (table: string) => {
      expect(table).toBe('checkout_leads')
      return {
        update: (patch: Record<string, unknown>) => {
          const call: Call = { patch, filters: [] }
          calls.push(call)
          const chain = {
            eq: (column: string, value: unknown) => (call.filters.push(['eq', column, value]), chain),
            is: (column: string, value: unknown) => (call.filters.push(['is', column, value]), chain),
            not: (column: string, op: string, value: unknown) => (call.filters.push(['not', `${column} ${op}`, value]), chain),
            select: () => ({ maybeSingle: async () => ({ data: claimRow, error: null }) }),
            then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
          }
          return chain
        },
      }
    },
  }
  return { admin: admin as never, calls }
}

const LEAD = {
  id: 'lead-1',
  reference_number: 'SM-123',
  email: 'ana@example.com',
  phone: '09171234567',
  amount: 5499,
  meta_attribution: {
    leadEventId: 'lead_abc',
    fbp: 'fb.1.111.222',
    fbc: 'fb.1.333.IwAR',
    clientUserAgent: 'Mozilla/5.0 (iPhone)',
    eventSourceUrl: 'https://www.webnegosyo.com/?fbclid=IwAR',
    clientIpAddress: '203.0.113.9',
  },
}

describe('toLeadMetaAttribution', () => {
  let toLeadMetaAttribution: Awaited<ReturnType<typeof load>>['toLeadMetaAttribution']
  beforeAll(async () => ({ toLeadMetaAttribution } = await load()))

  it('keeps the browser signals and the server-seen IP', () => {
    expect(
      toLeadMetaAttribution(
        { eventId: 'lead_abc', fbp: 'fb.1.1.2', eventSourceUrl: 'https://www.webnegosyo.com/', clientUserAgent: 'UA' },
        '203.0.113.9'
      )
    ).toEqual({
      leadEventId: 'lead_abc',
      fbp: 'fb.1.1.2',
      fbc: undefined,
      clientUserAgent: 'UA',
      eventSourceUrl: 'https://www.webnegosyo.com/',
      clientIpAddress: '203.0.113.9',
    })
  })

  it('is null without an event id (not a pixel page)', () => {
    expect(toLeadMetaAttribution(undefined, '1.2.3.4')).toBeNull()
    expect(toLeadMetaAttribution({ fbp: 'fb.1.1.2' }, '1.2.3.4')).toBeNull()
  })

  it('drops junk instead of failing the lead', () => {
    const attribution = toLeadMetaAttribution(
      { eventId: 'lead_abc', fbp: 'x'.repeat(201), eventSourceUrl: 'javascript:alert(1)', clientUserAgent: 'ok\u0000bad' },
      null
    )
    expect(attribution).toMatchObject({ leadEventId: 'lead_abc' })
    expect(attribution?.fbp).toBeUndefined()
    expect(attribution?.eventSourceUrl).toBeUndefined()
    expect(attribution?.clientUserAgent).toBeUndefined()
    expect(attribution?.clientIpAddress).toBeUndefined()
  })
})

describe('sendLeadPurchaseOnce', () => {
  let sendLeadPurchaseOnce: Awaited<ReturnType<typeof load>>['sendLeadPurchaseOnce']
  beforeAll(async () => ({ sendLeadPurchaseOnce } = await load()))
  beforeEach(() => {
    sendMetaConversionEvent.mockReset()
  })

  it('claims only a paid, browser, never-sent lead', async () => {
    const { admin, calls } = fakeAdmin(LEAD)
    sendMetaConversionEvent.mockResolvedValue({ sent: true })

    await sendLeadPurchaseOnce(admin, 'lead-1')

    expect(calls[0].filters).toEqual([
      ['eq', 'id', 'lead-1'],
      ['is', 'meta_purchase_sent_at', null],
      ['not', 'paid_at is', null],
      ['not', 'meta_attribution is', null],
    ])
    expect(calls[0].patch.meta_purchase_sent_at).toEqual(expect.any(String))
  })

  it('sends a website Purchase with the BUYER signals stored at order time', async () => {
    const { admin, calls } = fakeAdmin(LEAD)
    sendMetaConversionEvent.mockResolvedValue({ sent: true })

    expect(await sendLeadPurchaseOnce(admin, 'lead-1')).toEqual({ sent: true })

    expect(sendMetaConversionEvent).toHaveBeenCalledWith({
      eventName: 'Purchase',
      eventId: 'purchase_SM-123',
      eventSourceUrl: 'https://www.webnegosyo.com/?fbclid=IwAR',
      userData: {
        email: 'ana@example.com',
        phone: '09171234567',
        fbp: 'fb.1.111.222',
        fbc: 'fb.1.333.IwAR',
        clientIpAddress: '203.0.113.9',
        clientUserAgent: 'Mozilla/5.0 (iPhone)',
        externalId: 'SM-123',
        country: 'ph',
      },
      customData: { content_name: 'Smart Menu System', currency: 'PHP', value: 5499, order_id: 'SM-123' },
    })
    expect(calls).toHaveLength(1) // the claim stays
  })

  it('sends nothing when the claim matched no row (already sent, unpaid, or a staff-made lead)', async () => {
    const { admin, calls } = fakeAdmin(null)
    expect(await sendLeadPurchaseOnce(admin, 'lead-1')).toEqual({ sent: false, reason: 'not-eligible' })
    expect(sendMetaConversionEvent).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
  })

  it('gives its own claim back when Meta did not take the event', async () => {
    const { admin, calls } = fakeAdmin(LEAD)
    sendMetaConversionEvent.mockResolvedValue({ sent: false, skipped: 'missing-meta-config' })

    expect(await sendLeadPurchaseOnce(admin, 'lead-1')).toEqual({ sent: false, reason: 'send-failed' })

    expect(calls).toHaveLength(2)
    const claimedAt = calls[0].patch.meta_purchase_sent_at
    expect(calls[1].patch).toEqual({ meta_purchase_sent_at: null })
    expect(calls[1].filters).toEqual([
      ['eq', 'id', 'lead-1'],
      ['eq', 'meta_purchase_sent_at', claimedAt],
    ])
  })

  it('treats a thrown send like a refusal', async () => {
    const { admin, calls } = fakeAdmin(LEAD)
    sendMetaConversionEvent.mockRejectedValue(new Error('network'))
    expect(await sendLeadPurchaseOnce(admin, 'lead-1')).toEqual({ sent: false, reason: 'send-failed' })
    expect(calls).toHaveLength(2)
  })
})

describe('a payment screenshot is not a Purchase', () => {
  it('the engine has no screenshot path: only staff-confirmed paid_at can claim a Purchase', async () => {
    const engine = (await load()) as Record<string, unknown>
    expect(engine.sendProofPurchaseOnce).toBeUndefined()
  })

  it('the browser pixel cannot fire a Purchase (fake screenshots counted in Ads Manager, 2026-11-14)', () => {
    // Pinned by the type: `npm run typecheck` fails here if Purchase is ever
    // added back to the browser's MetaEventName. Never called.
    const neverRun = (track: typeof import('@/lib/meta-pixel').trackMetaEvent) => {
      // @ts-expect-error Purchase is server-only (staff-confirmed paid_at).
      track('Purchase', {})
    }
    expect(typeof neverRun).toBe('function')
  })
})

describe('META_PURCHASE_STATUSES', () => {
  it('are exactly the statuses whose trigger stamps paid_at', async () => {
    const { META_PURCHASE_STATUSES } = await load()
    expect([...META_PURCHASE_STATUSES].sort()).toEqual(['live', 'paid', 'setup_in_progress'])
  })
})
