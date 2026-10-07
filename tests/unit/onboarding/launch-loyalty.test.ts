/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'

interface FakeOptions {
  programs?: Array<{ id: string; status: string }>
  owner?: { user_id: string } | null
  menu?: Array<{ id: string; name: string; price: number; is_available: boolean; presell_enabled: boolean | null; image_url?: string | null }>
  flags?: { loyalty_enabled: boolean; loyalty_shadow: boolean }
}

/** A chainable stand-in for the service-role client: every builder call returns itself. */
function fakeAdmin(options: FakeOptions) {
  const rpc = jest.fn(async (_name: string, args: Record<string, unknown>) => {
    if (args.p_action === 'create') return { data: { programId: 'prog-1', versionId: 'v1', version: 1 }, error: null }
    return { data: { status: 'active' }, error: null }
  })
  const tenantUpdates: unknown[] = []

  function result(table: string, ids?: string[]) {
    switch (table) {
      case 'loyalty_programs':
        return { data: options.programs ?? [], error: null }
      case 'app_users':
        return { data: options.owner ?? null, error: null }
      case 'menu_items': {
        const rows = options.menu ?? []
        return { data: ids ? rows.filter((r) => ids.includes(r.id)) : rows, error: null }
      }
      case 'tenants':
        return { data: options.flags ?? { loyalty_enabled: false, loyalty_shadow: true }, error: null }
      default:
        return { data: null, error: null }
    }
  }

  const client = {
    rpc,
    from(table: string) {
      let ids: string[] | undefined
      const query: Record<string, unknown> = {}
      const chain = () => query
      Object.assign(query, {
        select: chain, eq: chain, order: chain, limit: chain,
        in: (_c: string, values: string[]) => { ids = values; return query },
        maybeSingle: async () => result(table, ids),
        single: async () => result(table, ids),
        update: (patch: unknown) => { tenantUpdates.push(patch); return { eq: async () => ({ error: null }) } },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result(table, ids)).then(resolve),
      })
      return query
    },
  } as unknown as SupabaseClient
  return { client, rpc, tenantUpdates }
}

const MENU = [
  { id: 'adobo', name: 'Chicken Adobo', price: 180, is_available: true, presell_enabled: false },
  { id: 'latte', name: 'Iced Latte', price: 120, is_available: true, presell_enabled: false },
  { id: 'cake', name: 'Pre-order Cake', price: 50, is_available: true, presell_enabled: true },
]

async function load() {
  return import('@/lib/onboarding/launch-loyalty')
}

describe('launchStarterLoyalty', () => {
  it('creates the card as the owner, activates it and switches the store live', async () => {
    // Arrange
    const { launchStarterLoyalty } = await load()
    const { client, rpc, tenantUpdates } = fakeAdmin({ owner: { user_id: 'owner-1' }, menu: MENU })

    // Act
    const result = await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: ['adobo', 'latte'] })

    // Assert
    expect(result).toEqual({ status: 'created', programId: 'prog-1', rewardLabel: 'Free Iced Latte', threshold: 8 })
    expect(rpc).toHaveBeenNthCalledWith(1, 'manage_loyalty_program', expect.objectContaining({
      p_tenant_id: 'tenant-1', p_actor: 'owner-1', p_action: 'create',
    }))
    expect(rpc).toHaveBeenNthCalledWith(2, 'manage_loyalty_program', expect.objectContaining({
      p_actor: 'owner-1', p_action: 'set_status', p_program_id: 'prog-1',
      p_input: { status: 'active', expectedStatus: 'draft' },
    }))
    expect(tenantUpdates).toEqual([{ loyalty_enabled: true, loyalty_shadow: false }])
  })

  it('never rewards a pre-sell item', async () => {
    const { launchStarterLoyalty } = await load()
    const { client, rpc } = fakeAdmin({ owner: { user_id: 'owner-1' }, menu: MENU })

    await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: ['cake'] })

    const created = rpc.mock.calls[0][1] as { p_input: { rules: { reward: { menuItemId: string } } } }
    expect(created.p_input.rules.reward.menuItemId).toBe('latte')
  })

  it('skips a store that already has an active program', async () => {
    const { launchStarterLoyalty } = await load()
    const { client, rpc } = fakeAdmin({ programs: [{ id: 'existing', status: 'active' }], owner: { user_id: 'owner-1' }, menu: MENU })

    const result = await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: [] })

    expect(result.status).toBe('skipped')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('finishes activating a draft an earlier attempt created but never switched on', async () => {
    // Arrange: a retry after the create succeeded and the activation threw.
    const { launchStarterLoyalty } = await load()
    const { client, rpc, tenantUpdates } = fakeAdmin({
      programs: [{ id: 'prog-draft', status: 'draft' }], owner: { user_id: 'owner-1' }, menu: MENU,
    })

    // Act
    const result = await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: ['adobo', 'latte'] })

    // Assert: no second program, the existing draft goes live.
    expect(result).toEqual({ status: 'created', programId: 'prog-draft', rewardLabel: 'Free Iced Latte', threshold: 8 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('manage_loyalty_program', expect.objectContaining({
      p_actor: 'owner-1', p_action: 'set_status', p_program_id: 'prog-draft',
      p_input: { status: 'active', expectedStatus: 'draft' },
    }))
    expect(tenantUpdates).toEqual([{ loyalty_enabled: true, loyalty_shadow: false }])
  })

  it('leaves a paused or ended program alone', async () => {
    const { launchStarterLoyalty } = await load()
    const { client, rpc } = fakeAdmin({ programs: [{ id: 'p', status: 'paused' }], owner: { user_id: 'owner-1' }, menu: MENU })

    const result = await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: [] })

    expect(result.status).toBe('skipped')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('skips when the store has no owner to act as', async () => {
    const { launchStarterLoyalty } = await load()
    const { client, rpc } = fakeAdmin({ owner: null, menu: MENU })

    const result = await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: [] })

    expect(result).toEqual({ status: 'skipped', reason: 'The store has no owner account yet.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('skips when nothing on the menu can be the reward', async () => {
    const { launchStarterLoyalty } = await load()
    const { client, rpc } = fakeAdmin({ owner: { user_id: 'owner-1' }, menu: [] })

    const result = await launchStarterLoyalty(client, 'tenant-1', { storeName: 'Kape', bestSellerIds: [] })

    expect(result.status).toBe('skipped')
    expect(rpc).not.toHaveBeenCalled()
  })
})
