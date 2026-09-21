import { isBrandAdminFor, type BrandAdminClient } from '@/lib/storefront/brand-admin'

function createClient(user: { id: string } | null, role: { role: string; tenant_id: string | null } | null): BrandAdminClient {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: role }) }),
      }),
    }),
  } as unknown as BrandAdminClient
}

describe('isBrandAdminFor', () => {
  test('anonymous visitor is not an admin', async () => {
    await expect(isBrandAdminFor(createClient(null, null), 't-1')).resolves.toBe(false)
  })

  test('admin of the same tenant is an admin', async () => {
    await expect(isBrandAdminFor(createClient({ id: 'u' }, { role: 'admin', tenant_id: 't-1' }), 't-1')).resolves.toBe(true)
  })

  test('admin of another tenant is not', async () => {
    await expect(isBrandAdminFor(createClient({ id: 'u' }, { role: 'admin', tenant_id: 't-2' }), 't-1')).resolves.toBe(false)
  })

  test('superadmin is an admin everywhere', async () => {
    await expect(isBrandAdminFor(createClient({ id: 'u' }, { role: 'superadmin', tenant_id: null }), 't-1')).resolves.toBe(true)
  })
})
