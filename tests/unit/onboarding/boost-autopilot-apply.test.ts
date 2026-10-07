/** @jest-environment node */
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { BoostIdea } from '@/lib/boost/ideas'

const applyBoostIdea = jest.fn()
jest.mock('@/lib/boost/ai/apply', () => ({ applyBoostIdea: (...args: unknown[]) => applyBoostIdea(...args) }))

const MENU = [
  { id: 'adobo', name: 'Chicken Adobo', price: 180, image_url: null, category_id: 'c-mains', is_available: true, is_featured: false, show_in_checkout_upsell: false, category: { name: 'Rice Meals' } },
  { id: 'sisig', name: 'Pork Sisig', price: 190, image_url: null, category_id: 'c-mains', is_available: true, is_featured: false, show_in_checkout_upsell: false, category: { name: 'Rice Meals' } },
  { id: 'fries', name: 'Fries', price: 60, image_url: null, category_id: 'c-sides', is_available: true, is_featured: false, show_in_checkout_upsell: false, category: { name: 'Sides' } },
  { id: 'rice', name: 'Extra Rice', price: 25, image_url: null, category_id: 'c-sides', is_available: true, is_featured: false, show_in_checkout_upsell: false, category: { name: 'Sides' } },
  { id: 'coke', name: 'Coke', price: 45, image_url: null, category_id: 'c-drinks', is_available: true, is_featured: false, show_in_checkout_upsell: false, category: { name: 'Drinks' } },
  { id: 'tea', name: 'Iced Tea', price: 40, image_url: null, category_id: 'c-drinks', is_available: true, is_featured: false, show_in_checkout_upsell: false, category: { name: 'Drinks' } },
]

function fakeCtx(tables: Record<string, unknown>): ProvisioningCtx {
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {}
      const chain = () => query
      const result = { data: tables[table] ?? [], error: null }
      Object.assign(query, {
        select: chain, eq: chain, order: chain, limit: chain,
        single: async () => result,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      })
      return query
    },
  }
  return { client } as unknown as ProvisioningCtx
}

const TENANT = { checkout_upsell_enabled: false, checkout_upsell_title: null, checkout_upsell_subtitle: null, checkout_upsell_max_items: null }

async function load() {
  return import('@/lib/onboarding/boost-autopilot')
}

describe('applyLaunchBoost', () => {
  beforeEach(() => applyBoostIdea.mockReset())

  it('applies the selected cold-start ideas on the injected client and reports each one', async () => {
    // Arrange
    const { applyLaunchBoost } = await load()
    const ctx = fakeCtx({ menu_items: MENU, tenants: TENANT, bundles: [], upsell_pairs: [] })
    applyBoostIdea.mockImplementation(async (_t: string, idea: BoostIdea) => ({ status: 'applied', ref: `${idea.kind}-ref` }))

    // Act
    const result = await applyLaunchBoost(ctx, 'tenant-1', { bestSellerIds: ['sisig'] })

    // Assert
    expect(result.applied.length).toBeGreaterThan(0)
    expect(result.skipped).toEqual([])
    for (const call of applyBoostIdea.mock.calls) {
      expect(call[0]).toBe('tenant-1')
      expect(call[3]).toBe(ctx)
    }
    const kinds = result.applied.map((a) => a.kind)
    expect(kinds).toEqual(expect.arrayContaining(['combo', 'pairing', 'last_call']))
    expect(kinds.filter((k) => k === 'combo').length).toBeLessThanOrEqual(2)
  })

  it('records a failing or needs-edit idea as skipped and keeps going', async () => {
    const { applyLaunchBoost } = await load()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const ctx = fakeCtx({ menu_items: MENU, tenants: TENANT, bundles: [], upsell_pairs: [] })
    applyBoostIdea
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'needs-edit' })
      .mockResolvedValue({ status: 'applied', ref: null })

    const result = await applyLaunchBoost(ctx, 'tenant-1')

    expect(result.skipped[0]).toMatchObject({ reason: 'boom' })
    expect(result.skipped[1].reason).toMatch(/needs editing/)
    expect(result.applied.length).toBe(applyBoostIdea.mock.calls.length - 2)
  })

  it('does not rebuild offers that are already live', async () => {
    const { applyLaunchBoost } = await load()
    const live = MENU.map((row) => ({ ...row, show_in_checkout_upsell: false }))
    const ctx = fakeCtx({
      menu_items: live,
      tenants: { ...TENANT, checkout_upsell_enabled: true },
      bundles: [{ slots: [{ included_item_ids: MENU.map((m) => m.id) }] }],
      upsell_pairs: MENU.flatMap((m) => [
        { source_item_id: m.id, pair_type: 'upgrade' },
        { source_item_id: m.id, pair_type: 'complementary' },
      ]),
    })
    applyBoostIdea.mockResolvedValue({ status: 'applied', ref: null })

    const result = await applyLaunchBoost(ctx, 'tenant-1')

    expect(result.applied).toEqual([])
    expect(applyBoostIdea).not.toHaveBeenCalled()
  })

  it('throws when the menu cannot be read', async () => {
    const { applyLaunchBoost } = await load()
    const ctx = {
      client: {
        from() {
          const query: Record<string, unknown> = {}
          const chain = () => query
          const result = { data: null, error: { message: 'down' } }
          Object.assign(query, {
            select: chain, eq: chain, order: chain, limit: chain,
            single: async () => result,
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
          })
          return query
        },
      },
    } as unknown as ProvisioningCtx

    await expect(applyLaunchBoost(ctx, 'tenant-1')).rejects.toThrow(/could not be read: down/)
  })
})
