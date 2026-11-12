import { BRANCH_CLOSED, BRANCH_NOT_FOUND, loadDraft, readDraftTenant } from '@/lib/app-api/orders/load-draft'
import { draftToOrderLines } from '@/lib/app-api/orders/draft-to-lines'
import { fakeSupabaseTables } from '../../../fixtures/fake-supabase-tables'
import { DISH, TENANT } from './order-fixtures'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/app-api/store-reads', () => ({ AppReadError: class AppReadError extends Error {} }))

const OTHER_TENANT = '00000000-0000-4000-8000-000000000002'
const CATEGORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LINKED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BRANCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CLOSED_BRANCH = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const DISH_ROW = {
  id: DISH,
  tenant_id: TENANT,
  category_id: CATEGORY,
  name: 'Burger meal',
  price: 150,
  is_available: true,
  variations: [],
  addons: [],
  modifier_groups: [
    { id: 'drink', name: 'Drink', selection_mode: 'choice', min_select: 1, max_select: 1, options: [{ id: 'coke', name: 'Coke', price: 0, menu_item_id: LINKED }] },
  ],
}

const TABLES = {
  tenants: [{ id: TENANT, is_active: true, order_backend: 'auto', convex_deployment_url: null, modifier_groups_enabled: true, multi_branch_enabled: true, lalamove_enabled: false }],
  menu_items: [
    DISH_ROW,
    { id: LINKED, tenant_id: TENANT, category_id: CATEGORY, name: 'Coke', price: 40, is_available: true, variations: [], addons: [] },
    { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', tenant_id: OTHER_TENANT, category_id: CATEGORY, name: 'Not ours', price: 1, is_available: true, variations: [], addons: [] },
  ],
  categories: [{ id: CATEGORY, tenant_id: TENANT, name: 'Meals', is_active: true, default_addons: [] }],
  outlets: [
    { id: BRANCH, tenant_id: TENANT, name: 'Katipunan', is_active: true },
    { id: CLOSED_BRANCH, tenant_id: TENANT, name: 'Old branch', is_active: false },
  ],
  outlet_menu_items: [
    { id: 'o1', tenant_id: TENANT, outlet_id: BRANCH, menu_item_id: LINKED, is_listed: true, is_available: false, price: null, discounted_price: null, discount_cleared: false },
  ],
}

const LINE = { itemId: DISH, quantity: 1, selections: { drink: { coke: 1 } } }

describe('readDraftTenant', () => {
  it('resolves the backend and the flags the order path needs', async () => {
    const { client } = fakeSupabaseTables(TABLES)
    expect(await readDraftTenant(client, TENANT)).toMatchObject({ id: TENANT, backend: 'platform', isMultiBranch: true, isLalamove: false, modifierGroupsEnabled: true })
  })

  it('routes through resolveOrderBackend (a Convex url without a pin is Convex)', async () => {
    const { client } = fakeSupabaseTables({ tenants: [{ ...TABLES.tenants[0], convex_deployment_url: 'https://x.convex.cloud' }] })
    expect((await readDraftTenant(client, TENANT))?.backend).toBe('convex')
  })

  it('is null for an inactive or missing store, and throws on a failed read', async () => {
    expect(await readDraftTenant(fakeSupabaseTables({ tenants: [{ ...TABLES.tenants[0], is_active: false }] }).client, TENANT)).toBeNull()
    await expect(readDraftTenant(fakeSupabaseTables(TABLES, { tenants: 'down' }).client, TENANT)).rejects.toThrow()
  })
})

describe('loadDraft', () => {
  async function tenantOf(overrides: Record<string, unknown> = {}) {
    const tenant = await readDraftTenant(fakeSupabaseTables({ tenants: [{ ...TABLES.tenants[0], ...overrides }] }).client, TENANT)
    if (!tenant) throw new Error('fixture tenant')
    return tenant
  }

  it('loads the dish, its category, its linked dish and the branch overrides, scoped to the store', async () => {
    // Arrange
    const { client, seen } = fakeSupabaseTables(TABLES)

    // Act
    const loaded = await loadDraft(client, await tenantOf(), { lines: [LINE], outletId: BRANCH })

    // Assert
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.outlet).toEqual({ id: BRANCH, name: 'Katipunan' })
    expect([...loaded.input.menuItems.keys()].sort()).toEqual([DISH, LINKED].sort())
    expect(loaded.input.branchIndex.get(BRANCH)?.get(LINKED)?.is_available).toBe(false)
    expect(seen).toEqual(expect.arrayContaining(['outlets', 'menu_items', 'categories', 'outlet_menu_items']))
    // The branch has the linked drink sold out, so the translator refuses it.
    expect(draftToOrderLines(loaded.input)).toEqual({ ok: false, error: expect.stringContaining('sold out') })
  })

  it('never loads another store’s dish or a non-uuid id (the translator then calls it gone)', async () => {
    const { client } = fakeSupabaseTables(TABLES)
    const loaded = await loadDraft(client, await tenantOf(), {
      lines: [{ itemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', quantity: 1, selections: {} }, { itemId: 'not-a-uuid', quantity: 1, selections: {} }],
      outletId: null,
    })
    expect(loaded.ok && loaded.input.menuItems.size).toBe(0)
  })

  it.each([
    ['an unknown branch', '99999999-9999-4999-8999-999999999990', BRANCH_NOT_FOUND],
    ['a non-uuid branch', 'branch-1', BRANCH_NOT_FOUND],
    ['a closed branch', CLOSED_BRANCH, BRANCH_CLOSED],
  ])('refuses %s', async (_label, outletId, error) => {
    const { client } = fakeSupabaseTables(TABLES)
    expect(await loadDraft(client, await tenantOf(), { lines: [LINE], outletId })).toEqual({ ok: false, error })
  })

  it('ignores the branch for a store without branches', async () => {
    const { client, seen } = fakeSupabaseTables(TABLES)
    const loaded = await loadDraft(client, await tenantOf({ multi_branch_enabled: false }), { lines: [LINE], outletId: BRANCH })
    expect(loaded.ok && loaded.outlet).toBeNull()
    expect(seen).not.toContain('outlet_menu_items')
    expect(loaded.ok && draftToOrderLines(loaded.input).ok).toBe(true)
  })
})
