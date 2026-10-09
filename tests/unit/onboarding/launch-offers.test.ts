/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComboIdea } from '@/lib/boost/ideas'

const getBoostAiProposal = jest.fn()
const decideBoostAiProposal = jest.fn()
const createBoostAiProposalNow = jest.fn()
const readOwnerUserId = jest.fn()
const loadLaunchMenu = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/boost/ai/store', () => ({ getBoostAiProposal: (...a: unknown[]) => getBoostAiProposal(...a) }))
jest.mock('@/lib/boost/ai/service', () => ({
  decideBoostAiProposal: (...a: unknown[]) => decideBoostAiProposal(...a),
  createBoostAiProposalNow: (...a: unknown[]) => createBoostAiProposalNow(...a),
}))
jest.mock('@/lib/onboarding/launch-loyalty', () => ({ readOwnerUserId: (...a: unknown[]) => readOwnerUserId(...a) }))
jest.mock('@/lib/onboarding/boost-autopilot', () => ({ loadLaunchMenu: (...a: unknown[]) => loadLaunchMenu(...a) }))

const COMBO: ComboIdea = {
  kind: 'combo', id: 'combo:latte:ens', title: 'Spanish Latte + Cheesy Ensaymada', reason: 'A drink and something to eat',
  itemIds: ['latte', 'ens'], name: 'Spanish Latte + Cheesy Ensaymada',
  picks: [{ label: 'Spanish Latte', itemIds: ['latte'] }, { label: 'Dessert', itemIds: ['ens'] }],
  regularPrice: 185, price: 169, savings: { amount: 16, percent: 9 },
}

/** `boost_ai_generations` answers the launch generation id. */
function fakeAdmin(launchId: string | null = 'gen-launch') {
  return {
    from() {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: launchId ? { id: launchId } : null, error: null })
      return q
    },
  } as unknown as SupabaseClient
}

const proposal = (patch: Record<string, unknown> = {}) => ({
  id: 'p1', generationId: 'gen-launch', kind: 'combo', position: 0, idea: COMBO, status: 'pending',
  decidedAt: null, appliedAt: null, appliedRef: null, ...patch,
})

beforeEach(() => {
  jest.clearAllMocks()
  readOwnerUserId.mockResolvedValue('owner-1')
  loadLaunchMenu.mockResolvedValue({ items: [{ id: 'latte' }], lastCall: { enabled: false } })
  createBoostAiProposalNow.mockResolvedValue('applied')
})

async function load() {
  return import('@/lib/onboarding/launch-offers')
}

describe('toLaunchComboView', () => {
  it('shows the dishes as they are on the menu now, with the price and the saving', async () => {
    const { toLaunchComboView } = await load()
    const names = new Map([['latte', { name: 'Spanish Latte', price: 120 }], ['ens', { name: 'Cheesy Ensaymada', price: 65 }]])

    const view = toLaunchComboView({ id: 'p1', status: 'pending', idea: COMBO }, names)

    expect(view).toEqual({
      id: 'p1', title: 'Spanish Latte + Cheesy Ensaymada', reason: 'A drink and something to eat',
      items: [{ name: 'Spanish Latte', price: 120 }, { name: 'Cheesy Ensaymada', price: 65 }],
      price: 169, regularPrice: 185, saves: 16, status: 'waiting',
    })
    expect(toLaunchComboView({ id: 'p1', status: 'applied', idea: COMBO }, names).status).toBe('kept')
    expect(toLaunchComboView({ id: 'p1', status: 'rejected', idea: COMBO }, names).status).toBe('skipped')
  })
})

describe('decideLaunchCombo', () => {
  it('keeps a combo through the approve → apply path, as the owner, on the menu read here', async () => {
    const { decideLaunchCombo } = await load()
    getBoostAiProposal.mockResolvedValue(proposal())

    const outcome = await decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'keep')

    expect(outcome).toBe('kept')
    const [tenant, owner, id, ctx, menu] = createBoostAiProposalNow.mock.calls[0]
    expect(tenant).toEqual({ id: 't1', slug: 'kape' })
    expect(owner).toBe('owner-1')
    expect(id).toBe('p1')
    expect(ctx).toHaveProperty('client')
    expect(menu).toEqual({ items: [{ id: 'latte' }], lastCall: { enabled: false } })
  })

  it('skips by rejecting, and never creates anything', async () => {
    const { decideLaunchCombo } = await load()
    getBoostAiProposal.mockResolvedValue(proposal())

    expect(await decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'skip')).toBe('skipped')
    expect(decideBoostAiProposal).toHaveBeenCalledWith('t1', 'owner-1', 'p1', 'reject')
    expect(createBoostAiProposalNow).not.toHaveBeenCalled()
  })

  it('refuses a suggestion that is not one of this store\'s launch combos', async () => {
    const { decideLaunchCombo, LaunchOfferError } = await load()
    getBoostAiProposal.mockResolvedValue(proposal({ generationId: 'gen-ai' }))
    await expect(decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'keep')).rejects.toBeInstanceOf(LaunchOfferError)

    getBoostAiProposal.mockResolvedValue(proposal({ kind: 'upgrade' }))
    await expect(decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'keep')).rejects.toThrow(/not part of your launch/)

    getBoostAiProposal.mockResolvedValue(null)
    await expect(decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'skip')).rejects.toThrow(/not part of your launch/)
    expect(createBoostAiProposalNow).not.toHaveBeenCalled()
    expect(decideBoostAiProposal).not.toHaveBeenCalled()
  })

  it('is idempotent: keeping a live combo or skipping a skipped one changes nothing', async () => {
    const { decideLaunchCombo } = await load()
    getBoostAiProposal.mockResolvedValue(proposal({ status: 'applied' }))
    expect(await decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'keep')).toBe('kept')
    await expect(decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'skip')).rejects.toThrow(/already on your menu/)

    getBoostAiProposal.mockResolvedValue(proposal({ status: 'rejected' }))
    expect(await decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'skip')).toBe('skipped')
    expect(createBoostAiProposalNow).not.toHaveBeenCalled()
    expect(decideBoostAiProposal).not.toHaveBeenCalled()
  })

  it('reports a combo that needs an edit before it can go live', async () => {
    const { decideLaunchCombo } = await load()
    getBoostAiProposal.mockResolvedValue(proposal())
    createBoostAiProposalNow.mockResolvedValue('needs-edit')

    expect(await decideLaunchCombo(fakeAdmin(), { id: 't1', slug: 'kape' }, 'p1', 'keep')).toBe('needs-edit')
  })
})
