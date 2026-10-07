/** @jest-environment node */
import { estimateSmsSegments } from '@/lib/assistant/insights/sms-segments'
import { createRefBook } from '@/lib/assistant/refs'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
const mockCreatePending = jest.fn()
jest.mock('@/lib/assistant/actions/store', () => ({ createPendingAction: (...a: unknown[]) => mockCreatePending(...a) }))

function ctx() {
  return {
    tenantId: 't',
    tenantSlug: 's',
    conversationId: 'c',
    caller: { userId: 'u', role: 'admin', is_owner: true, permissions: null },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true },
    refs: createRefBook({}),
    photos: [],
    memo: <T,>(_key: string, load: () => Promise<T>) => load(),
  }
}

beforeEach(() => mockCreatePending.mockReset().mockResolvedValue({ id: 'act-1', expiresAt: '2026-10-07T00:00:00Z' }))

describe('estimateSmsSegments', () => {
  test('a short plain message is one text', () => {
    expect(estimateSmsSegments('Hi {{firstName}}, we miss you at {{storeName}}!', 'SeaCook')).toMatchObject({ segments: 1, isUnicode: false })
  })

  test('a peso sign switches to unicode and costs more texts', () => {
    const estimate = estimateSmsSegments('Hi {{firstName}}! Get ₱50 off your next order at {{storeName}} this week only, see you soon!', 'SeaCook')

    expect(estimate.isUnicode).toBe(true)
    expect(estimate.segments).toBe(2)
  })
})

describe('propose_sms_campaign', () => {
  test('files a DRAFT for an opted-in preset audience', async () => {
    const { proposeSmsCampaignTool } = await import('@/lib/assistant/tools/propose/sms')

    const result = await proposeSmsCampaignTool.run(ctx() as never, {
      name: 'Win back',
      audience: 'slipping_regulars',
      message: 'Hi {{firstName}}, your usual is waiting at {{storeName}}!',
      sendDate: null,
    })

    expect(result.facts).toMatchObject({ proposed: true, status: 'pending' })
    const filed = mockCreatePending.mock.calls[0][0] as { kind: string; payload: { draft: { status: string; audience: unknown } } }
    expect(filed.kind).toBe('sms_campaign')
    expect(filed.payload.draft.status).toBe('draft')
    expect(filed.payload.draft.audience).toEqual({ minOrderCount: 2, lastOrderOlderThanDays: 14 })
  })

  test('refuses a send date in the past', async () => {
    const { proposeSmsCampaignTool } = await import('@/lib/assistant/tools/propose/sms')

    const result = await proposeSmsCampaignTool.run(ctx() as never, { name: 'Old', audience: 'regulars', message: 'Hello there {{firstName}}!', sendDate: '2020-01-01' })

    expect(result.facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })
})

describe('propose_voucher', () => {
  const base = { code: 'save 10', name: 'Save ten', discount: { type: 'percent' as const, value: 10 }, minOrder: 300, maxDiscount: 100, items: null, startDate: null, endDate: null, usesPerCustomer: 1 }

  test('normalises the code and warns when it works immediately', async () => {
    const { proposeVoucherTool } = await import('@/lib/assistant/tools/propose/voucher')

    const result = await proposeVoucherTool.run(ctx() as never, base)

    expect(result.card).toMatchObject({ type: 'confirm', title: 'Voucher SAVE10', warning: 'Works at checkout as soon as you confirm.' })
  })

  test('uses the voucher form’s rules: an over-100% discount is refused', async () => {
    const { proposeVoucherTool } = await import('@/lib/assistant/tools/propose/voucher')

    const result = await proposeVoucherTool.run(ctx() as never, { ...base, discount: { type: 'percent', value: 150 } })

    expect(result.facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })

  test('refuses item refs it never issued', async () => {
    const { proposeVoucherTool } = await import('@/lib/assistant/tools/propose/voucher')

    const result = await proposeVoucherTool.run(ctx() as never, { ...base, items: ['i42'] })

    expect(result.facts).toMatchObject({ proposed: false })
  })
})

describe('break-even result', () => {
  test('labels assumed food cost', async () => {
    const { buildBreakevenResult } = await import('@/lib/assistant/tools/reads/promotions')
    const { computeBreakeven } = await import('@/lib/assistant/insights/breakeven')

    const result = buildBreakevenResult(computeBreakeven([{ name: 'Sisig', price: 200, unitCost: null }], { kind: 'percent_off', value: 20 }))

    expect(String(result.facts.caveat)).toMatch(/assumed at 35%/)
  })
})
