/**
 * Server-side permission gating for menu-domain mutations.
 *
 * The staff branch gated bundles/upsell/branding/payment/orders/etc. with
 * `verifyTenantPermission`, but left the core menu/category CRUD in
 * admin-service on bare `verifyTenantAdmin`, and `addon-library-service`
 * (added on main after the branch split) shipped ungated too. Both belong to
 * the "Menu" window, so a staffer WITHOUT the `menu` permission — who is
 * already hidden from the Menu UI — must also be rejected server-side. UI
 * gating is not access control.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

// Mutable app_users identity returned by verifyTenantAdmin's lookup. The `mock`
// prefix lets the jest.mock factory (hoisted above imports) reference it.
const mockAppUser: {
  role: string
  tenant_id: string | null
  is_owner: boolean | null
  permissions: string[] | null
} = { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['orders'] }

// Self-contained Supabase server mock. Every query builds a chainable, thenable
// proxy that resolves to `{ data: row, error: null }`, so ungated calls succeed
// cleanly — a RED failure then means "no permission gate", not "broken mock".
jest.mock('@/lib/supabase/server', () => {
  const row = () => ({
    id: 'row_1',
    tenant_id: mockAppUser.tenant_id,
    role: mockAppUser.role,
    is_owner: mockAppUser.is_owner,
    permissions: mockAppUser.permissions,
  })
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => unknown) => resolve({ data: row(), error: null })
          }
          return () => chain()
        },
      }
    )
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'user_staff' } }, error: null }) },
      from: () => chain(),
    }),
  }
})

// require() (not ES import) so these load AFTER jest.mock registers the
// supabase/server stub — an ES import hoists above the mock and auto-mocks it.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { createCategory, updateCategory, createMenuItem, deleteMenuItem } =
  require('@/lib/admin-service') as any
const { createAddonLibraryEntry, updateAddonLibraryEntry, deleteAddonLibraryEntry } =
  require('@/lib/addon-library-service') as any
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const category = { name: 'Drinks', order: 0, is_active: true, display_layout: 'grid' as const, default_addons: [] }
const menuItem = {
  name: 'Latte',
  description: 'A warm espresso drink with steamed milk on top',
  price: 120,
  category_id: OTHER,
}
const addon = { name: 'Extra Shot', price: 30 }

describe('menu-domain mutations reject a staffer without the "menu" permission', () => {
  beforeEach(() => {
    mockAppUser.is_owner = false
    mockAppUser.permissions = ['orders']
  })

  it('createCategory rejects', async () => {
    await expect(createCategory(TENANT, category)).rejects.toThrow(/permission/i)
  })

  it('updateCategory rejects', async () => {
    await expect(updateCategory('cat_1', TENANT, category)).rejects.toThrow(/permission/i)
  })

  it('createMenuItem rejects', async () => {
    await expect(createMenuItem(TENANT, menuItem)).rejects.toThrow(/permission/i)
  })

  it('deleteMenuItem rejects', async () => {
    await expect(deleteMenuItem('item_1', TENANT)).rejects.toThrow(/permission/i)
  })

  it('createAddonLibraryEntry rejects', async () => {
    await expect(createAddonLibraryEntry(TENANT, addon)).rejects.toThrow(/permission/i)
  })

  it('updateAddonLibraryEntry rejects', async () => {
    await expect(updateAddonLibraryEntry('entry_1', TENANT, addon)).rejects.toThrow(/permission/i)
  })

  it('deleteAddonLibraryEntry rejects', async () => {
    await expect(deleteAddonLibraryEntry('entry_1', TENANT)).rejects.toThrow(/permission/i)
  })
})

describe('the owner (permissions gate does not apply) is still allowed', () => {
  beforeEach(() => {
    mockAppUser.is_owner = true
    mockAppUser.permissions = ['orders']
  })

  it('createCategory resolves for the owner', async () => {
    await expect(createCategory(TENANT, category)).resolves.toBeDefined()
  })

  it('createAddonLibraryEntry resolves for the owner', async () => {
    await expect(createAddonLibraryEntry(TENANT, addon)).resolves.toBeDefined()
  })
})
