import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantPermission } from '@/lib/admin-service'
import { createBundle, updateBundle, getSlotItems, reorderBundles, type BundleInput } from '@/lib/bundles-service'
import { getBundleAction, getBundlesAction } from '@/app/actions/bundles'

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const input: BundleInput = {
  name: 'Meal', image_url: '', pricing_type: 'fixed', fixed_price: 100,
  is_active: true, show_on_menu: true, show_as_upsell: false, display_order: 0,
  slots: [{ name: 'Drink', category_id: '00000000-0000-4000-8000-000000000001', pick_count: 1, sort_order: 0, price_overrides: [] }],
}

beforeEach(() => jest.resetAllMocks())

it.each(['create', 'update'])('allows an authorized %s with tenant-owned references', async (operation) => {
  const saved = { id: 'bundle', tenant_id: 'tenant', slots: [] }
  const writes: string[] = []
  const from = (table: string) => {
    let ids: string[] = []
    const builder = {
      select: () => builder, eq: () => builder,
      in: (_key: string, values: string[]) => { ids = values; return builder },
      insert: () => { writes.push(table); return builder },
      update: () => { writes.push(table); return builder },
      delete: () => { writes.push(table); return builder },
      single: async () => ({ data: table === 'bundles' ? saved : { id: 'slot' }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: ids.map(id => ({ id })), error: null }).then(resolve),
    }
    return builder
  }
  jest.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>)
  const result = operation === 'create' ? await createBundle('tenant', input) : await updateBundle('bundle', 'tenant', input)
  expect(result).toEqual(saved)
  expect(writes).toContain('bundles')
  expect(writes).toContain('bundle_slots')
  expect(verifyTenantPermission).toHaveBeenCalledWith('tenant', 'menu')
})

it.each(['one', 'all'])('rejects unauthorized admin bundle reads (%s) before querying', async (mode) => {
  jest.mocked(verifyTenantPermission).mockRejectedValue(new Error('Forbidden'))
  const result = mode === 'one' ? await getBundleAction('bundle', 'tenant') : await getBundlesAction('tenant')
  expect(result).toEqual({ success: false, error: 'Forbidden' })
  expect(createAdminClient).not.toHaveBeenCalled()
})

it('never deletes slots when the bundle update matches no row in the authorized tenant', async () => {
  const from = jest.fn(() => {
    const builder = {
      update: () => builder, eq: () => builder, select: () => builder,
      single: async () => ({ data: null, error: new Error('Bundle not found') }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return builder
  })
  jest.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>)
  await expect(updateBundle('foreign-bundle', 'tenant', input)).rejects.toThrow()
  expect(from.mock.calls).toEqual([['bundles']])
})

it('scopes category metadata to the same tenant as slot items', async () => {
  const filters: unknown[][] = []
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters.push([table, key, value]); return builder },
      order: () => builder,
      single: async () => ({ data: {}, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    return builder
  }
  jest.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>)
  await getSlotItems('category', 'tenant')
  expect(filters).toContainEqual(['categories', 'tenant_id', 'tenant'])
})

it('reports failed reorders instead of claiming success', async () => {
  const builder = {
    update: () => builder, eq: () => builder,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: new Error('Write failed') }).then(resolve),
  }
  jest.mocked(createAdminClient).mockReturnValue({ from: () => builder } as unknown as ReturnType<typeof createAdminClient>)
  await expect(reorderBundles('tenant', ['bundle'])).rejects.toThrow('Write failed')
})

it.each(['category', 'item'])('rejects foreign %s references before creating a bundle', async (foreign) => {
  const writes = jest.fn()
  const filters: unknown[][] = []
  const from = (table: string) => {
    const builder = {
      select: () => builder, insert: writes,
      eq: (key: string, value: unknown) => { filters.push([table, key, value]); return builder },
      in: (_key: string, ids: string[]) => {
        const data = (foreign === 'category' || table === 'menu_items') ? [] : ids.map(id => ({ id }))
        return { ...builder, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
      },
    }
    return builder
  }
  jest.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>)
  await expect(createBundle('tenant', {
    ...input, slots: [{ ...input.slots[0], included_item_ids: ['00000000-0000-4000-8000-000000000002'] }],
  })).rejects.toThrow(/belong to this store/)
  expect(writes).not.toHaveBeenCalled()
  expect(filters).toContainEqual(['categories', 'tenant_id', 'tenant'])
})
