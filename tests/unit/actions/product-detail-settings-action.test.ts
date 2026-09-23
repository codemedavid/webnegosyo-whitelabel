/**
 * saveProductDetailSettings / resetProductDetailSettings used an inline
 * role check (any admin of the tenant, so staff WITHOUT `store_setup` could
 * restyle the product page), passed the payload to the database after only
 * stripping unknown keys (no value validation; a `tenant_id` key in the body
 * even overrode the authorized tenant in the upsert), and purged the route
 * cache under a client-supplied slug (`[tenant]` = every storefront).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

function makeCookieClient() {
  const select = jest.fn(async () => ({ data: [{ id: 'row' }], error: null }))
  const upsert = jest.fn<(row: unknown, options: unknown) => { select: typeof select }>(() => ({ select }))
  const deleteEq = jest.fn(async () => ({ error: null }))
  const del = jest.fn(() => ({ eq: deleteEq }))
  const from = jest.fn(() => ({ upsert, delete: del }))
  return { client: { from }, upsert, del }
}

function makeAdminClient(slug: string | null) {
  const maybeSingle = jest.fn(async () => ({ data: slug ? { slug } : null, error: null }))
  const eq = jest.fn(() => ({ maybeSingle }))
  return { from: jest.fn(() => ({ select: jest.fn(() => ({ eq })) })) }
}

async function load(slug: string | null = 'real-cafe') {
  const adminService = await import('@/lib/admin-service')
  const server = await import('@/lib/supabase/server')
  const admin = await import('@/lib/supabase/admin')
  const nextCache = await import('next/cache')
  const cookie = makeCookieClient()
  jest.mocked(adminService.verifyTenantPermission).mockReset().mockResolvedValue(undefined as never)
  jest.mocked(server.createClient).mockResolvedValue(cookie.client as never)
  jest.mocked(admin.createAdminClient).mockReturnValue(makeAdminClient(slug) as never)
  const action = await import('@/app/actions/product-detail-settings')
  return {
    ...action,
    cookie,
    verifyTenantPermission: jest.mocked(adminService.verifyTenantPermission),
    revalidatePath: jest.mocked(nextCache.revalidatePath),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('saveProductDetailSettings', () => {
  it('requires the store_setup permission', async () => {
    const m = await load()
    m.verifyTenantPermission.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))

    const result = await m.saveProductDetailSettings('tenant-1', 'cafe', { product_name_color: '#111111' })

    expect(m.verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'store_setup')
    expect(result.success).toBe(false)
    expect(m.cookie.upsert).not.toHaveBeenCalled()
  })

  it('saves validated settings and purges the slug stored for the tenant', async () => {
    const m = await load()

    const result = await m.saveProductDetailSettings('tenant-1', '[tenant]', {
      product_name_color: '#111111',
      enable_animations: false,
      animation_speed: 'fast',
      buy_now_button_label: "Grab it — it's hot",
      id: 'meta',
    })

    expect(result.success).toBe(true)
    expect(m.cookie.upsert).toHaveBeenCalledWith(
      { tenant_id: 'tenant-1', product_name_color: '#111111', enable_animations: false, animation_speed: 'fast', buy_now_button_label: "Grab it — it's hot" },
      { onConflict: 'tenant_id' },
    )
    expect(m.revalidatePath).toHaveBeenCalledWith('/real-cafe/menu', 'layout')
    const purged = m.revalidatePath.mock.calls.map((call) => String(call[0]))
    expect(purged.some((path) => path.includes('[tenant]'))).toBe(false)
  })

  it('never lets a tenant_id in the payload redirect the upsert to another tenant', async () => {
    const m = await load()

    await m.saveProductDetailSettings('tenant-1', 'cafe', { tenant_id: 'victim', product_name_color: '#111111' } as never)

    const [row] = m.cookie.upsert.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(row.tenant_id).toBe('tenant-1')
  })

  it.each([
    [{ product_name_color: 'red;}body{display:none' }],
    [{ page_background_gradient: '180deg, #fff, #000); background: url(https://evil.com' + '"' }],
    [{ section_padding: '1px; position:fixed' }],
    [{ animation_speed: 'warp' }],
    [{ enable_animations: 'yes' }],
    [{ buy_now_button_label: 'x'.repeat(500) }],
    [{ mobile_overrides: { product_name_color: 'red;}' } }],
    [{ mobile_overrides: { tenant_id: 'victim' } }],
  ])('refuses an invalid payload %j without writing', async (settings) => {
    const m = await load()

    const result = await m.saveProductDetailSettings('tenant-1', 'cafe', settings as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Validation error/)
    expect(m.cookie.upsert).not.toHaveBeenCalled()
  })

  it('accepts null columns the customizer sends for unset fields', async () => {
    const m = await load()
    const result = await m.saveProductDetailSettings('tenant-1', 'cafe', { product_name_color: null } as never)
    expect(result.success).toBe(true)
  })

  it('drops unknown mobile override keys and keeps valid ones', async () => {
    const m = await load()

    await m.saveProductDetailSettings('tenant-1', 'cafe', {
      mobile_overrides: { product_name_color: '#222222', legacyKey: 'x' },
    } as never)

    const [row] = m.cookie.upsert.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(row.mobile_overrides).toEqual({ product_name_color: '#222222' })
  })
})

describe('resetProductDetailSettings', () => {
  it('requires the store_setup permission', async () => {
    const m = await load()
    m.verifyTenantPermission.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))

    const result = await m.resetProductDetailSettings('tenant-1', 'cafe')

    expect(result.success).toBe(false)
    expect(m.cookie.del).not.toHaveBeenCalled()
  })

  it('purges the stored slug, not the one sent by the client', async () => {
    const m = await load()

    await m.resetProductDetailSettings('tenant-1', '[tenant]')

    expect(m.revalidatePath).toHaveBeenCalledWith('/real-cafe/menu', 'layout')
    const purged = m.revalidatePath.mock.calls.map((call) => String(call[0]))
    expect(purged.some((path) => path.includes('[tenant]'))).toBe(false)
  })
})
