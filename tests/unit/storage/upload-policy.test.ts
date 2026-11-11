import { describe, expect, it } from '@jest/globals'
import { authorizeUploadFolder, isUploadTypeAllowedFor, type UploadCaller } from '@/lib/storage/upload-policy'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function staff(permissions: string[] | null, isOwner = false): UploadCaller {
  return { role: 'admin', tenantId: TENANT, isOwner, permissions }
}

describe('authorizeUploadFolder', () => {
  it.each([
    ['menu-items', ['menu']],
    ['variation-options', ['menu']],
    ['modifier-options', ['menu']],
    ['tenants', ['analytics']],
    ['tenants/hero', ['store_setup']],
    ['tenants/footer', ['settings']],
    ['tenants/flash-screens', ['settings']],
    ['promotion-banners', ['store_setup']],
    ['page-backgrounds', ['store_setup']],
    ['outlets', ['store_setup']],
    ['payment-qr-codes', ['store_setup']],
    ['payment-proofs', ['pos']],
    ['day-close-deposits', ['cash_manage']],
  ])('lets staff holding the key upload to %s, inside their own store', (folder, permissions) => {
    expect(authorizeUploadFolder(staff(permissions), folder)).toEqual({ ok: true, folder: `${folder}/${TENANT}` })
  })

  it('refuses staff without the key that folder needs', () => {
    expect(authorizeUploadFolder(staff(['kitchen']), 'menu-items').ok).toBe(false)
    expect(authorizeUploadFolder(staff(['orders']), 'payment-qr-codes').ok).toBe(false)
    expect(authorizeUploadFolder(staff(['analytics']), 'tenants/hero').ok).toBe(false)
  })

  it('a legacy full-access account uploads everywhere except the opt-in cash folder', () => {
    expect(authorizeUploadFolder(staff(null), 'menu-items').ok).toBe(true)
    expect(authorizeUploadFolder(staff(null), 'day-close-deposits').ok).toBe(false)
  })

  it('an owner holds every key', () => {
    expect(authorizeUploadFolder(staff([], true), 'day-close-deposits').ok).toBe(true)
  })

  it('keeps a folder that already names the caller\'s own store exactly once', () => {
    expect(authorizeUploadFolder(staff(['menu']), `menu-items/${TENANT}`)).toEqual({
      ok: true,
      folder: `menu-items/${TENANT}`,
    })
  })

  it('refuses another store\'s prefix, unknown folders and platform folders for store staff', () => {
    expect(authorizeUploadFolder(staff(['menu']), `menu-items/${OTHER}`).ok).toBe(false)
    expect(authorizeUploadFolder(staff(['menu']), 'menu-items/anything').ok).toBe(false)
    expect(authorizeUploadFolder(staff(null), 'platform/whats-new').ok).toBe(false)
    expect(authorizeUploadFolder(staff(null), 'tenant-logos').ok).toBe(false)
    expect(authorizeUploadFolder(staff(null), 'constructor').ok).toBe(false)
  })

  it('refuses a store account with no store', () => {
    expect(authorizeUploadFolder({ role: 'admin', tenantId: null, isOwner: true, permissions: null }, 'menu-items').ok).toBe(false)
  })

  it.each(['superadmin', 'platform_staff'] as const)('leaves %s folders as requested: they work across stores', (role) => {
    const caller: UploadCaller = { role, tenantId: null, isOwner: false, permissions: null }
    expect(authorizeUploadFolder(caller, 'tenant-logos')).toEqual({ ok: true, folder: 'tenant-logos' })
    expect(authorizeUploadFolder(caller, 'platform/university/resources')).toEqual({
      ok: true,
      folder: 'platform/university/resources',
    })
  })
})

describe('isUploadTypeAllowedFor', () => {
  it('store staff upload images only: no screen of theirs takes anything else', () => {
    expect(isUploadTypeAllowedFor('admin', 'image/jpeg')).toBe(true)
    expect(isUploadTypeAllowedFor('admin', 'image/heic')).toBe(true)
    expect(isUploadTypeAllowedFor('admin', 'application/pdf')).toBe(false)
    expect(isUploadTypeAllowedFor('admin', 'video/mp4')).toBe(false)
    expect(isUploadTypeAllowedFor('admin', 'application/zip')).toBe(false)
  })

  it('platform accounts keep documents and video (University resources)', () => {
    expect(isUploadTypeAllowedFor('superadmin', 'application/pdf')).toBe(true)
    expect(isUploadTypeAllowedFor('platform_staff', 'video/mp4')).toBe(true)
  })
})
