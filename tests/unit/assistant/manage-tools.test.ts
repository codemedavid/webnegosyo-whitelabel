/** @jest-environment node */
/**
 * The "manage what exists" tools: each read hands the model refs (never ids),
 * and each proposal is refused unless the stored change is valid by the same
 * rules the admin screens use — and files nothing when it is refused.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createRefBook } from '@/lib/assistant/refs'
import { factsForModel } from '@/lib/assistant/tools/registry'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockAdmin() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
const mockCreatePending = jest.fn()
jest.mock('@/lib/assistant/actions/store', () => ({ createPendingAction: (...a: unknown[]) => mockCreatePending(...a) }))
const mockWorkspace = jest.fn()
jest.mock('@/lib/assistant/data/boost', () => ({ readBoostWorkspace: () => mockWorkspace() }))
const mockLoyalty = jest.fn()
jest.mock('@/lib/assistant/data/loyalty', () => ({ readAssistantLoyalty: () => mockLoyalty() }))
const mockCampaigns = jest.fn()
jest.mock('@/lib/assistant/data/campaigns', () => ({ readAssistantCampaigns: () => mockCampaigns() }))
const mockVouchers = jest.fn()
jest.mock('@/lib/assistant/data/vouchers', () => ({ readAssistantVouchers: () => mockVouchers() }))
jest.mock('@/lib/loyalty/program-catalog', () => ({
  resolveProgramCatalog: async (_c: unknown, _t: string, rules: { reward: { type: string } }) =>
    rules.reward.type === 'free_item' ? { rules: { ...rules, reward: { ...rules.reward, itemName: 'Iced Latte' } } } : { rules },
}))
let mockMenuRow: Record<string, unknown> | null = null
function mockAdmin() {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mockMenuRow, error: null }) }
  return { from: () => chain }
}

const BURGER = '00000000-0000-4000-8000-000000000001'
const FRIES = '00000000-0000-4000-8000-000000000002'
const COKE = '00000000-0000-4000-8000-000000000003'
const COMBO = '00000000-0000-4000-8000-0000000000c1'
const UPGRADE = '00000000-0000-4000-8000-0000000000u1'.replace('u', 'a')
const PROGRAM = '00000000-0000-4000-8000-0000000000p1'.replace('p', 'b')

function item(id: string, name: string, price: number, categoryId: string, isAvailable = true) {
  return { id, name, price, imageUrl: null, categoryId, categoryName: null, isAvailable, role: 'main' }
}

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    isEnabled: true,
    items: [item(BURGER, 'Burger', 150, 'k1'), item(FRIES, 'Fries', 60, 'k2'), item(COKE, 'Coke', 40, 'k3', false)],
    combos: [
      {
        id: COMBO, tenant_id: 't', name: 'Burger Meal', image_url: null, pricing_type: 'fixed', fixed_price: 189, discount_percent: null,
        is_active: true, show_on_menu: true, show_as_upsell: true, display_order: 0,
        slots: [
          { id: 's1', bundle_id: COMBO, name: 'Main', category_id: 'k1', pick_count: 1, sort_order: 0, included_item_ids: [BURGER], price_overrides: [] },
          { id: 's2', bundle_id: COMBO, name: 'Side', category_id: 'k2', pick_count: 1, sort_order: 1, included_item_ids: [FRIES], price_overrides: [] },
        ],
      },
    ],
    upgrades: [{ id: UPGRADE, sourceId: FRIES, targetId: BURGER, isActive: false, header: null, sourceLabel: null, targetLabel: null }],
    pairings: [{ key: 'p', sourceIds: [BURGER], targetIds: [FRIES], isActive: true, pairIds: ['x'] }],
    lastCall: { enabled: false, title: 'Add to your order', subtitle: '', maxItems: 4, pickedItemIds: [] },
    ideas: [],
    historyOrders: 120,
    performance: { days: 30, comboOrders: { [COMBO]: 14 }, suggestions: { orders: 9, revenue: 540 } },
    ...overrides,
  }
}

function ctx(refs = createRefBook({})) {
  return {
    tenantId: 't',
    tenantSlug: 's',
    conversationId: 'c',
    caller: { userId: 'u', role: 'admin', is_owner: true, permissions: null },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true },
    refs,
    photos: [],
    memo: <T,>(_key: string, load: () => Promise<T>) => load(),
  }
}

beforeEach(() => {
  mockCreatePending.mockReset().mockResolvedValue({ id: 'act-1', expiresAt: '2026-10-07T00:00:00Z' })
  mockWorkspace.mockReset().mockResolvedValue(workspace())
})

describe('offer targets', () => {
  test('round-trip, and a forged target resolves to nothing', async () => {
    const { decodeOfferTarget, encodeOfferTarget } = await import('@/lib/assistant/insights/offer-target')

    expect(decodeOfferTarget(encodeOfferTarget({ kind: 'pairing', sourceIds: [FRIES, BURGER] }))).toEqual({ kind: 'pairing', sourceIds: [BURGER, FRIES] })
    expect(decodeOfferTarget(encodeOfferTarget({ kind: 'combo', id: COMBO }))).toEqual({ kind: 'combo', id: COMBO })
    expect(decodeOfferTarget('combo:not-a-uuid')).toBeNull()
    expect(decodeOfferTarget('bundle:' + COMBO)).toBeNull()
  })
})

describe('get_live_offers', () => {
  test('lists every offer with a ref, its state and combo orders — no raw ids for the model', async () => {
    const { buildLiveOffersResult } = await import('@/lib/assistant/tools/reads/live-offers')

    const result = buildLiveOffersResult(workspace() as never, 'all', createRefBook({}))
    const facts = factsForModel(result) as { offers: Array<Record<string, unknown>> }

    expect(facts.offers).toEqual([
      { ref: 'o1', kind: 'combo', name: 'Burger Meal', status: 'on', price: 189, regularPrice: 210, orders30d: 14 },
      { ref: 'o2', kind: 'upgrade', name: 'Fries → Burger', status: 'paused' },
      { ref: 'o3', kind: 'pairing', name: 'After Burger', status: 'on' },
    ])
    expect(JSON.stringify(result.facts)).not.toContain(COMBO)
  })
})

describe('propose_offer_change', () => {
  async function propose(change: 'pause' | 'resume' | 'price', offerIndex: number, price: number | null = null) {
    const { buildLiveOffersResult } = await import('@/lib/assistant/tools/reads/live-offers')
    const { proposeOfferChangeTool } = await import('@/lib/assistant/tools/propose/offer-change')
    const refs = createRefBook({})
    buildLiveOffersResult(workspace() as never, 'all', refs)
    return proposeOfferChangeTool.run(ctx(refs) as never, { offer: `o${offerIndex}`, change, price })
  }

  test('pausing a live combo files the change for the owner to confirm', async () => {
    const result = await propose('pause', 1)

    expect(result.card).toMatchObject({ type: 'confirm', title: 'Pause combo' })
    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({
      kind: 'offer_change',
      payload: { target: { kind: 'combo', id: COMBO }, change: 'pause', expected: { isActive: true, fixedPrice: 189, discountPercent: null } },
    })
  })

  test('a pairing is addressed by its source dishes', async () => {
    await propose('pause', 3)

    expect(mockCreatePending.mock.calls[0][0].payload.target).toEqual({ kind: 'pairing', sourceIds: [BURGER] })
  })

  test('a combo priced at or above its dishes separately is refused', async () => {
    const result = await propose('price', 1, 210)

    expect(result.facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })

  test('a valid new combo price is proposed with the old one shown', async () => {
    const result = await propose('price', 1, 179)

    expect(result.card).toMatchObject({ lines: expect.arrayContaining([{ label: 'Price', value: '₱189 → ₱179' }]) })
  })

  test('resuming an offer that is already on, or re-pricing an upgrade, is refused', async () => {
    expect((await propose('resume', 1)).facts).toMatchObject({ proposed: false })
    expect((await propose('price', 2, 99)).facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })

  test('an unknown ref is refused', async () => {
    const { proposeOfferChangeTool } = await import('@/lib/assistant/tools/propose/offer-change')

    const result = await proposeOfferChangeTool.run(ctx() as never, { offer: 'o9', change: 'pause', price: null })

    expect(result.facts).toMatchObject({ proposed: false })
  })
})

describe('propose_cart_last_call', () => {
  test('picks resolve from item refs, and Boost Sales is switched on with it', async () => {
    mockWorkspace.mockResolvedValue(workspace({ isEnabled: false }))
    const { proposeCartLastCallTool } = await import('@/lib/assistant/tools/propose/last-call')
    const refs = createRefBook({})
    const fries = refs.refFor('item', FRIES)

    await proposeCartLastCallTool.run(ctx(refs) as never, { enabled: true, title: 'Before you go', items: [fries], maxItems: null })

    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({
      kind: 'last_call',
      payload: { enableBoost: true, input: { enabled: true, title: 'Before you go', maxItems: 4, pickedItemIds: [FRIES] } },
    })
  })

  test('a sold-out dish cannot be offered', async () => {
    const { proposeCartLastCallTool } = await import('@/lib/assistant/tools/propose/last-call')
    const refs = createRefBook({})

    const result = await proposeCartLastCallTool.run(ctx(refs) as never, { enabled: true, title: null, items: [refs.refFor('item', COKE)], maxItems: null })

    expect(result.facts).toMatchObject({ proposed: false })
  })
})

describe('loyalty', () => {
  const rules = { earnMode: 'stamp', threshold: 10, pointsPerPeso: null, minSpend: null, reward: { type: 'fixed', amount: 100 }, rewardExpiryDays: null, isExclusive: true }
  const program = (status: string) => ({ id: PROGRAM, name: 'Coffee Card', status, earnMode: 'stamp', rules, versionNumber: 3, members: 40, rewardsOutstanding: 2 })
  const noMilestones = { stampsForReward: 8, minSpend: null, milestones: null, rewardExpiryDays: 30 }

  test('with no program, says so and offers to set one up', async () => {
    const { buildLoyaltyResult } = await import('@/lib/assistant/tools/reads/loyalty')

    const result = buildLoyaltyResult({ isLive: false, programs: [], totals: null, nearReward: [], last30Days: null }, createRefBook({}))

    expect(result.facts).toMatchObject({ hasProgram: false })
  })

  test('a new stamp card is drafted with a snapshotted free item', async () => {
    mockLoyalty.mockResolvedValue({ isLive: false, programs: [], totals: null, nearReward: [], last30Days: null })
    const { proposeLoyaltyProgramTool } = await import('@/lib/assistant/tools/propose/loyalty')
    const refs = createRefBook({})

    const result = await proposeLoyaltyProgramTool.run(ctx(refs) as never, {
      program: null,
      name: 'Coffee Card',
      reward: { type: 'free_item', amount: null, percent: null, maxAmount: null, item: refs.refFor('item', BURGER) },
      ...noMilestones,
    })

    expect(result.card).toMatchObject({ warning: 'Saved as a draft. Customers earn nothing until you make it live.' })
    const filed = mockCreatePending.mock.calls[0][0]
    expect(filed.kind).toBe('loyalty_program')
    expect(filed.payload).toMatchObject({ mode: 'create', input: { earnMode: 'stamp', scope: 'business', rules: { threshold: 8, rewardExpiryDays: 30, reward: { type: 'free_item', menuItemId: BURGER, itemName: 'Iced Latte' } } } })
  })

  test('editing captures the version it was based on; a second program is refused', async () => {
    mockLoyalty.mockResolvedValue({ isLive: true, programs: [program('active')], totals: null, nearReward: [], last30Days: null })
    const { proposeLoyaltyProgramTool } = await import('@/lib/assistant/tools/propose/loyalty')
    const refs = createRefBook({})
    const reward = { type: 'fixed' as const, amount: 120, percent: null, maxAmount: null, item: null }

    const second = await proposeLoyaltyProgramTool.run(ctx(refs) as never, { program: null, name: 'Another', reward, ...noMilestones })
    await proposeLoyaltyProgramTool.run(ctx(refs) as never, { program: refs.refFor('program', PROGRAM), name: null, reward, ...noMilestones })

    expect(second.facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).toHaveBeenCalledTimes(1)
    expect(mockCreatePending.mock.calls[0][0].payload).toMatchObject({ mode: 'revise', programId: PROGRAM, expectedVersion: 3, rules: { threshold: 8 } })
  })

  test('a milestone outside the card is refused by the shared rules', async () => {
    mockLoyalty.mockResolvedValue({ isLive: false, programs: [], totals: null, nearReward: [], last30Days: null })
    const { proposeLoyaltyProgramTool } = await import('@/lib/assistant/tools/propose/loyalty')
    const reward = { type: 'fixed' as const, amount: 50, percent: null, maxAmount: null, item: null }

    const result = await proposeLoyaltyProgramTool.run(ctx() as never, { ...noMilestones, program: null, name: 'Card', reward, milestones: [{ at: 8, reward }] })

    expect(result.facts).toMatchObject({ proposed: false })
  })

  test('going live from a draft warns that it switches loyalty on; ended is not even an option', async () => {
    mockLoyalty.mockResolvedValue({ isLive: false, programs: [program('draft')], totals: null, nearReward: [], last30Days: null })
    const { proposeLoyaltyStatusTool } = await import('@/lib/assistant/tools/propose/loyalty')
    const refs = createRefBook({})
    const ref = refs.refFor('program', PROGRAM)

    const result = await proposeLoyaltyStatusTool.run(ctx(refs) as never, { program: ref, status: 'active' })

    expect(result.card).toMatchObject({ warning: 'Turns loyalty on for your store. Orders completed before now never earn.' })
    expect(mockCreatePending.mock.calls[0][0].payload).toEqual({ programId: PROGRAM, name: 'Coffee Card', to: 'active', expectedStatus: 'draft' })
    expect(proposeLoyaltyStatusTool.input.safeParse({ program: ref, status: 'ended' }).success).toBe(false)
  })

  test('a draft cannot be paused', async () => {
    mockLoyalty.mockResolvedValue({ isLive: false, programs: [program('draft')], totals: null, nearReward: [], last30Days: null })
    const { proposeLoyaltyStatusTool } = await import('@/lib/assistant/tools/propose/loyalty')
    const refs = createRefBook({})

    const result = await proposeLoyaltyStatusTool.run(ctx(refs) as never, { program: refs.refFor('program', PROGRAM), status: 'paused' })

    expect(result.facts).toMatchObject({ proposed: false })
  })
})

describe('SMS campaigns', () => {
  const campaign = (status: string) => ({ id: 'cmp-1', name: 'Win back', status, audience: { minOrderCount: 2, lastOrderOlderThanDays: 14 }, scheduleKind: 'one_off', scheduleDate: '2026-10-08', scheduleTime: '10:00', sent30d: 31, failed30d: 2 })

  test('a preset audience is named in the owner’s words', async () => {
    const { buildCampaignsResult } = await import('@/lib/assistant/tools/reads/campaigns')

    const result = buildCampaignsResult({ campaigns: [campaign('active')] as never, reachable: 120, isSendCountCapped: false }, createRefBook({}))

    expect(result.facts).toMatchObject({ guestsWhoCanBeTexted: 120, campaigns: [{ ref: 'm1', audience: 'Regulars (2+ orders) quiet for 2+ weeks', sent30d: 31 }] })
  })

  test('only an active campaign can be paused', async () => {
    const { proposePauseSmsCampaignTool } = await import('@/lib/assistant/tools/propose/campaign-status')
    const refs = createRefBook({})
    const ref = refs.refFor('campaign', 'cmp-1')

    mockCampaigns.mockResolvedValueOnce({ campaigns: [campaign('draft')], reachable: 0, isSendCountCapped: false })
    expect((await proposePauseSmsCampaignTool.run(ctx(refs) as never, { campaign: ref })).facts).toMatchObject({ proposed: false })

    mockCampaigns.mockResolvedValueOnce({ campaigns: [campaign('active')], reachable: 0, isSendCountCapped: false })
    await proposePauseSmsCampaignTool.run(ctx(refs) as never, { campaign: ref })
    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({ kind: 'campaign_status', payload: { campaignId: 'cmp-1' } })
  })
})

describe('vouchers', () => {
  const voucher = { id: 'v-1', code: 'SAVE10', name: 'Save', discountType: 'percent', discountValue: 10, maxDiscountAmount: 50, scope: 'universal', isStackable: false, usedCount: 12, channels: ['checkout'], isActive: true }

  test('state reads expired / scheduled / used up from the voucher’s own limits', async () => {
    const { voucherState } = await import('@/lib/assistant/tools/reads/vouchers')
    const now = Date.parse('2026-10-06T00:00:00Z')

    expect(voucherState(voucher as never, now)).toBe('on')
    expect(voucherState({ ...voucher, endsAt: '2026-10-01T00:00:00Z' } as never, now)).toBe('expired')
    expect(voucherState({ ...voucher, startsAt: '2026-10-09T00:00:00Z' } as never, now)).toBe('scheduled')
    expect(voucherState({ ...voucher, usageLimitTotal: 12 } as never, now)).toBe('used_up')
    expect(voucherState({ ...voucher, isActive: false } as never, now)).toBe('off')
  })

  test('switching off files the change; switching an off voucher off is refused', async () => {
    mockVouchers.mockResolvedValue({ vouchers: [voucher], last30Days: new Map(), isRedemptionCountCapped: false })
    const { proposeVoucherStatusTool } = await import('@/lib/assistant/tools/propose/voucher-status')
    const refs = createRefBook({})
    const ref = refs.refFor('voucher', 'v-1')

    await proposeVoucherStatusTool.run(ctx(refs) as never, { voucher: ref, active: false })
    const again = await proposeVoucherStatusTool.run(ctx(refs) as never, { voucher: ref, active: true })

    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({ kind: 'voucher_status', payload: { voucherId: 'v-1', code: 'SAVE10', isActive: false } })
    expect(again.facts).toMatchObject({ proposed: false })
  })
})

describe('propose_menu_item_change', () => {
  beforeEach(() => {
    mockMenuRow = { id: BURGER, name: 'Burger', price: 150, discounted_price: null, is_available: true }
  })

  async function propose(price: number | null, available: boolean | null) {
    const { proposeMenuItemChangeTool } = await import('@/lib/assistant/tools/propose/menu-item-change')
    const refs = createRefBook({})
    return proposeMenuItemChangeTool.run(ctx(refs) as never, { item: refs.refFor('item', BURGER), price, available })
  }

  test('a price change and sold-out are filed together', async () => {
    await propose(165, false)

    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({ kind: 'menu_item_change', payload: { itemId: BURGER, price: 165, isAvailable: false, expectedPrice: 150 } })
  })

  test('a price more than 3x away from today’s is treated as a likely typo', async () => {
    expect((await propose(1500, null)).facts).toMatchObject({ proposed: false })
  })

  test('the new price must stay above an existing sale price', async () => {
    mockMenuRow = { ...mockMenuRow, discounted_price: 140 }

    expect((await propose(139, null)).facts).toMatchObject({ proposed: false })
  })

  test('marking an available dish available changes nothing and files nothing', async () => {
    expect((await propose(null, true)).facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })
})

describe('action kinds', () => {
  test('every kind the code can file is allowed by the database constraint', async () => {
    const { ACTION_PERMISSION } = await import('@/lib/assistant/actions/kinds')
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261007120000_assistant_manage_action_kinds.sql'), 'utf8')
    const allowed = [...migration.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])

    for (const kind of Object.keys(ACTION_PERMISSION)) expect(allowed).toContain(kind)
  })
})
