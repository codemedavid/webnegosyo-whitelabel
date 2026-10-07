/** @jest-environment node */
/**
 * A confirmed "manage" proposal runs through the admin screens' own writers,
 * refreshes the caches they refresh, and refuses — changing nothing — when
 * the thing it targets moved on since the proposal.
 */

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

let mockUpdatedRows: unknown[] = []
/** What a read of each table returns right now (the state at Confirm). */
let mockRows: Record<string, unknown[]> = {}
const mockUpdate = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let isUpdate = false
      const result = () => ({ data: isUpdate ? mockUpdatedRows : (mockRows[table] ?? []), error: null })
      const chain = {
        update: (row: unknown) => ((isUpdate = true), mockUpdate(row), chain),
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: (mockRows[table] ?? [])[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      }
      return chain
    },
  }),
}))
const mockBoost = { setBoostEnabled: jest.fn(), setBoostPairingActive: jest.fn(), saveBoostLastCall: jest.fn() }
jest.mock('@/lib/boost/writes', () => mockBoost)
const mockBundles = { toggleBundleActive: jest.fn(), updateBundleFields: jest.fn() }
jest.mock('@/lib/bundles-service', () => mockBundles)
const mockUpdateUpsellPair = jest.fn()
jest.mock('@/lib/menu-engineering-service', () => ({ updateUpsellPair: (...a: unknown[]) => mockUpdateUpsellPair(...a) }))
const mockRefreshOffers = jest.fn()
jest.mock('@/lib/boost/refresh-offer-caches', () => ({ refreshOfferCaches: (...a: unknown[]) => mockRefreshOffers(...a) }))
const mockInvalidateTenant = jest.fn()
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: (...a: unknown[]) => mockInvalidateTenant(...a) }))
const mockUpdateFields = jest.fn()
jest.mock('@/lib/admin-service', () => ({ updateMenuItemFields: (...a: unknown[]) => mockUpdateFields(...a) }))
const mockRevalidateMenu = jest.fn()
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: (...a: unknown[]) => mockRevalidateMenu(...a) }))
const mockToggleAvailability = jest.fn()
jest.mock('@/app/actions/menu-items', () => ({ toggleAvailabilityAction: (...a: unknown[]) => mockToggleAvailability(...a) }))
const mockSetVoucherActive = jest.fn()
jest.mock('@/app/actions/voucher-admin', () => ({ setVoucherActiveAction: (...a: unknown[]) => mockSetVoucherActive(...a) }))
jest.mock('@/lib/loyalty/program-catalog', () => ({ resolveProgramCatalog: async (_c: unknown, _t: string, rules: unknown) => ({ rules }) }))
const mockLoyaltyRepo = { createLoyaltyProgram: jest.fn(), reviseLoyaltyProgram: jest.fn(), readLoyaltyProgramStatus: jest.fn(), writeLoyaltyProgramStatus: jest.fn() }
jest.mock('@/lib/loyalty/repository', () => mockLoyaltyRepo)
const mockSwitchLive = jest.fn()
jest.mock('@/lib/loyalty/go-live-write', () => ({ switchLoyaltyLive: (...a: unknown[]) => mockSwitchLive(...a) }))

const STORE = { id: 't', slug: 's' }
const ID = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  jest.clearAllMocks()
  mockUpdatedRows = [{ id: 'cmp-1' }]
  mockRows = {
    bundles: [{ is_active: true, fixed_price: 189, discount_percent: null }],
    upsell_pairs: [{ is_active: true }],
    menu_items: [{ price: 150 }],
  }
})

describe('offer changes', () => {
  test('pausing a pairing goes through the pairing writer and refreshes the storefront offers', async () => {
    const { executeOfferChange } = await import('@/lib/assistant/actions/execute-manage')

    const outcome = await executeOfferChange(STORE, { target: { kind: 'pairing', sourceIds: [ID] }, change: 'pause', price: null, name: 'After Burger', expected: { isActive: true } })

    expect(mockBoost.setBoostPairingActive).toHaveBeenCalledWith('t', [ID], false)
    expect(mockRefreshOffers).toHaveBeenCalledWith('t', 's')
    expect(outcome).toMatchObject({ ok: true, message: 'After Burger is paused.' })
  })

  test('a combo price becomes a fixed price; an upgrade resume flips is_active', async () => {
    const { executeOfferChange } = await import('@/lib/assistant/actions/execute-manage')

    await executeOfferChange(STORE, { target: { kind: 'combo', id: ID }, change: 'price', price: 179, name: 'Meal', expected: { isActive: true, fixedPrice: 189, discountPercent: null } })
    mockRows.upsell_pairs = [{ is_active: false }]
    await executeOfferChange(STORE, { target: { kind: 'upgrade', id: ID }, change: 'resume', price: null, name: 'Up', expected: { isActive: false } })

    expect(mockBundles.updateBundleFields).toHaveBeenCalledWith(ID, 't', { pricing_type: 'fixed', fixed_price: 179 })
    expect(mockUpdateUpsellPair).toHaveBeenCalledWith(ID, 't', { is_active: true })
  })

  test('a combo re-priced in Boost Sales after the proposal is not overwritten', async () => {
    mockRows.bundles = [{ is_active: true, fixed_price: 199, discount_percent: null }]
    const { executeOfferChange } = await import('@/lib/assistant/actions/execute-manage')

    const outcome = await executeOfferChange(STORE, { target: { kind: 'combo', id: ID }, change: 'price', price: 179, name: 'Meal', expected: { isActive: true, fixedPrice: 189, discountPercent: null } })

    expect(outcome.ok).toBe(false)
    expect(mockBundles.updateBundleFields).not.toHaveBeenCalled()
  })

  test('an offer deleted since the proposal changes nothing', async () => {
    mockRows.upsell_pairs = []
    const { executeOfferChange } = await import('@/lib/assistant/actions/execute-manage')

    const outcome = await executeOfferChange(STORE, { target: { kind: 'upgrade', id: ID }, change: 'pause', price: null, name: 'Up', expected: { isActive: true } })

    expect(outcome).toEqual({ ok: false, error: 'That offer no longer exists, so nothing was changed.' })
    expect(mockUpdateUpsellPair).not.toHaveBeenCalled()
  })
})

test('last call switches Boost Sales on first when the proposal says so', async () => {
  const { executeLastCall } = await import('@/lib/assistant/actions/execute-manage')
  const input = { enabled: true, title: 'Before you go', subtitle: '', maxItems: 4, pickedItemIds: [] }

  await executeLastCall(STORE, { input, enableBoost: true })

  expect(mockBoost.setBoostEnabled).toHaveBeenCalledWith('t', true)
  expect(mockBoost.saveBoostLastCall).toHaveBeenCalledWith('t', input)
  expect(mockInvalidateTenant).toHaveBeenCalledWith('s', 't')
})

describe('loyalty', () => {
  test('a status change refuses when the program moved on since the proposal', async () => {
    mockLoyaltyRepo.readLoyaltyProgramStatus.mockResolvedValue({ status: 'active', activatesAt: '2026-10-01T00:00:00Z' })
    const { executeLoyaltyStatus } = await import('@/lib/assistant/actions/execute-manage')

    const outcome = await executeLoyaltyStatus(STORE, { programId: ID, name: 'Card', to: 'active', expectedStatus: 'draft' }, 'u')

    expect(outcome.ok).toBe(false)
    expect(mockLoyaltyRepo.writeLoyaltyProgramStatus).not.toHaveBeenCalled()
  })

  test('going live stamps the start once and switches the store live', async () => {
    mockLoyaltyRepo.readLoyaltyProgramStatus.mockResolvedValue({ status: 'draft', activatesAt: null })
    const { executeLoyaltyStatus } = await import('@/lib/assistant/actions/execute-manage')

    const outcome = await executeLoyaltyStatus(STORE, { programId: ID, name: 'Card', to: 'active', expectedStatus: 'draft' }, 'u')

    const patch = mockLoyaltyRepo.writeLoyaltyProgramStatus.mock.calls[0][3]
    expect(patch).toMatchObject({ status: 'active', activates_at: expect.any(String) })
    expect(mockSwitchLive).toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: true })
  })

  test('a stale rules edit reports the conflict instead of a generic failure', async () => {
    mockLoyaltyRepo.reviseLoyaltyProgram.mockRejectedValue(new Error('Program changed. Reload before editing.'))
    const { executeLoyaltyProgram } = await import('@/lib/assistant/actions/execute-manage')

    const outcome = await executeLoyaltyProgram(STORE, { mode: 'revise', programId: ID, name: 'Card', rules: { reward: { type: 'fixed', amount: 1 } } as never, expectedVersion: 2 }, 'u')

    expect(outcome).toEqual({ ok: false, error: 'The program changed since this was proposed. Ask again for a fresh proposal.' })
    expect(mockLoyaltyRepo.reviseLoyaltyProgram).toHaveBeenCalledWith(expect.anything(), 't', ID, expect.anything(), 'u', 2)
  })
})

test('pausing a campaign that is no longer active changes nothing and says so', async () => {
  mockUpdatedRows = []
  const { executeCampaignStatus } = await import('@/lib/assistant/actions/execute-manage')

  const outcome = await executeCampaignStatus(STORE, { campaignId: 'cmp-1', name: 'Win back' })

  expect(mockUpdate).toHaveBeenCalledWith({ status: 'paused' })
  expect(outcome.ok).toBe(false)
})

test('a dish change writes the price, purges the storefront menu, then flips availability', async () => {
  mockToggleAvailability.mockResolvedValue({ success: true })
  const { executeMenuItemChange } = await import('@/lib/assistant/actions/execute-manage')

  const outcome = await executeMenuItemChange(STORE, { itemId: ID, name: 'Burger', price: 165, isAvailable: false, expectedPrice: 150 })

  expect(mockUpdateFields).toHaveBeenCalledWith(ID, 't', { price: 165 })
  expect(mockRevalidateMenu).toHaveBeenCalledWith('s')
  expect(mockToggleAvailability).toHaveBeenCalledWith(ID, 't', 's', false)
  expect(outcome).toMatchObject({ ok: true, message: 'Burger is now ₱165 and marked sold out.' })
})

test('a voucher the writer refuses reports the writer’s reason', async () => {
  mockSetVoucherActive.mockResolvedValue({ success: false, error: 'Unauthorized' })
  const { executeVoucherStatus } = await import('@/lib/assistant/actions/execute-manage')

  const outcome = await executeVoucherStatus(STORE, { voucherId: 'v', code: 'SAVE10', isActive: false })

  expect(outcome).toEqual({ ok: false, error: 'Unauthorized' })
})

test('a dish whose price changed since the proposal is not overwritten', async () => {
  mockRows.menu_items = [{ price: 155 }]
  const { executeMenuItemChange } = await import('@/lib/assistant/actions/execute-manage')

  const outcome = await executeMenuItemChange(STORE, { itemId: ID, name: 'Burger', price: 165, isAvailable: null, expectedPrice: 150 })

  expect(outcome.ok).toBe(false)
  expect(mockUpdateFields).not.toHaveBeenCalled()
})
