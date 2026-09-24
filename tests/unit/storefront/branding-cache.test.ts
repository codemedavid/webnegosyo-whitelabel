import { saveBrandingAction } from '@/app/actions/branding'
import { writeBrandingWithClient } from '@/lib/branding-service'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { invalidateTenantCache } from '@/lib/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))
jest.mock('@/lib/branding-service', () => ({ writeBrandingWithClient: jest.fn() }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

/** A service-role stub whose `tenants` row holds the given slug. */
function adminWithSlug(slug: string | null) {
  const maybeSingle = jest.fn(async () => ({ data: slug === null ? null : { slug }, error: null }))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, from, eq }
}

describe('branding publish cache refresh', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(createClient).mockResolvedValue({} as Awaited<ReturnType<typeof createClient>>)
    jest.mocked(createAdminClient).mockReturnValue(adminWithSlug('cafe').client)
  })

  afterEach(() => jest.restoreAllMocks())

  it('invalidates tenant data and storefront pages after saving while preserving rollout warnings', async () => {
    const saved = { success: true, warning: 'Some rollout fields were skipped', skippedFields: ['layout_config'] }
    jest.mocked(writeBrandingWithClient).mockResolvedValue(saved)

    const result = await saveBrandingAction('tenant-1', 'cafe', {})

    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'store_setup')
    expect(invalidateTenantCache).toHaveBeenCalledWith('cafe', 'tenant-1')
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/menu', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/cart', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/checkout', 'layout')
    expect(result).toEqual(saved)
  })

  it('returns the persisted success and still refreshes pages when tenant cache invalidation fails', async () => {
    const saved = { success: true, warning: 'Some rollout fields were skipped', skippedFields: ['layout_config'] }
    jest.mocked(writeBrandingWithClient).mockResolvedValue(saved)
    jest.mocked(invalidateTenantCache).mockRejectedValue(new Error('Redis unavailable'))

    const result = await saveBrandingAction('tenant-1', 'cafe', {})

    expect(result).toEqual(saved)
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/menu', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/privacy')
    expect(console.warn).toHaveBeenCalled()
  })

  it('keeps saved success and attempts the remaining routes when one Next invalidation throws', async () => {
    jest.mocked(writeBrandingWithClient).mockResolvedValue({ success: true })
    jest.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error('Route cache unavailable') })

    const result = await saveBrandingAction('tenant-1', 'cafe', {})

    expect(result).toEqual({ success: true })
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/checkout', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/privacy')
    expect(console.warn).toHaveBeenCalled()
  })

  it('does not invalidate caches for a rejected write', async () => {
    const rejected = { success: false, error: 'Invalid branding' }
    jest.mocked(writeBrandingWithClient).mockResolvedValue(rejected)

    expect(await saveBrandingAction('tenant-1', 'cafe', {})).toEqual(rejected)
    expect(invalidateTenantCache).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('does not write or invalidate when web authorization fails', async () => {
    jest.mocked(verifyTenantPermission).mockRejectedValue(new Error('Forbidden'))

    expect(await saveBrandingAction('tenant-1', 'cafe', {})).toEqual({ success: false, error: 'Forbidden' })
    expect(writeBrandingWithClient).not.toHaveBeenCalled()
    expect(invalidateTenantCache).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ignores a client-supplied 4th argument and still enforces store_setup (server actions are public endpoints)', async () => {
    jest.mocked(verifyTenantPermission).mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const forged = { client: {} } as unknown

    const call = saveBrandingAction as unknown as (...args: unknown[]) => Promise<unknown>
    expect(await call('tenant-1', 'cafe', {}, forged)).toEqual({
      success: false,
      error: 'Unauthorized: Missing permission for this feature',
    })
    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'store_setup')
    expect(writeBrandingWithClient).not.toHaveBeenCalled()
  })

  it('an empty-object 4th argument no longer skips authorization', async () => {
    jest.mocked(writeBrandingWithClient).mockResolvedValue({ success: true })
    const call = saveBrandingAction as unknown as (...args: unknown[]) => Promise<unknown>

    await call('tenant-1', 'cafe', {}, {})

    expect(verifyTenantPermission).toHaveBeenCalledWith('tenant-1', 'store_setup')
    expect(createClient).toHaveBeenCalled()
  })

  it('purges the slug read from the authorized tenant, never the one the client sent', async () => {
    const admin = adminWithSlug('real-cafe')
    jest.mocked(createAdminClient).mockReturnValue(admin.client)
    jest.mocked(writeBrandingWithClient).mockResolvedValue({ success: true })

    await saveBrandingAction('tenant-1', '[tenant]', {})

    expect(admin.from).toHaveBeenCalledWith('tenants')
    expect(admin.eq).toHaveBeenCalledWith('id', 'tenant-1')
    expect(invalidateTenantCache).toHaveBeenCalledWith('real-cafe', 'tenant-1')
    expect(revalidatePath).toHaveBeenCalledWith('/real-cafe/menu', 'layout')
    const purged = jest.mocked(revalidatePath).mock.calls.map((call) => call[0])
    expect(purged.some((path) => path.includes('[tenant]'))).toBe(false)
  })

  it('keeps the saved result but skips route purges when the tenant slug cannot be read', async () => {
    jest.mocked(createAdminClient).mockReturnValue(adminWithSlug(null).client)
    jest.mocked(writeBrandingWithClient).mockResolvedValue({ success: true })

    expect(await saveBrandingAction('tenant-1', 'cafe', {})).toEqual({ success: true })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
