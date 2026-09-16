import { saveBrandingAction } from '@/app/actions/branding'
import { writeBrandingWithClient } from '@/lib/branding-service'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { invalidateTenantCache } from '@/lib/cache'
import { revalidatePath } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))
jest.mock('@/lib/branding-service', () => ({ writeBrandingWithClient: jest.fn() }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn() }))

describe('branding publish cache refresh', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(createClient).mockResolvedValue({} as Awaited<ReturnType<typeof createClient>>)
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

  it('refreshes caches for an authorized provisioning write using its injected client', async () => {
    const client = {} as Awaited<ReturnType<typeof createClient>>
    jest.mocked(writeBrandingWithClient).mockResolvedValue({ success: true })

    expect(await saveBrandingAction('tenant-1', 'cafe', {}, { client })).toEqual({ success: true })
    expect(writeBrandingWithClient).toHaveBeenCalledWith(client, 'tenant-1', {})
    expect(verifyTenantPermission).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    expect(invalidateTenantCache).toHaveBeenCalledWith('cafe', 'tenant-1')
    expect(revalidatePath).toHaveBeenCalledWith('/cafe/menu', 'layout')
  })
})
