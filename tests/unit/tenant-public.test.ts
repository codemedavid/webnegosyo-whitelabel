/**
 * The storefront layout hands the whole `tenants` row to a client component,
 * so every column name — `lalamove_secret_key`, `loyverse_access_token` — is
 * serialised into the RSC payload of a public page. The values were null on
 * the tenant QA inspected, but the shape of a merchant's integrations is not
 * a guest's business, and the day one of them is set it ships to the browser.
 */

import { omitTenantSecrets, TENANT_SECRET_COLUMNS } from '@/lib/tenant-public'

describe('omitTenantSecrets', () => {
  const tenant = {
    id: 't1',
    name: 'SeaCook',
    lalamove_api_key: null,
    lalamove_secret_key: 'sk',
    loyverse_access_token: 'tok',
    messenger_page_access_token: 'page',
    convex_deploy_key: 'deploy',
    supabase_order_service_key: 'svc',
    primary_color: '#e60000',
  }

  it('drops every credential column and keeps the rest', () => {
    const publicTenant = omitTenantSecrets(tenant)

    for (const column of TENANT_SECRET_COLUMNS) expect(publicTenant).not.toHaveProperty(column)
    expect(publicTenant).toMatchObject({ id: 't1', name: 'SeaCook', primary_color: '#e60000' })
  })

  it('does not mutate the row it was given', () => {
    omitTenantSecrets(tenant)
    expect(tenant.loyverse_access_token).toBe('tok')
  })

  it('passes null through', () => {
    expect(omitTenantSecrets(null)).toBeNull()
  })
})
