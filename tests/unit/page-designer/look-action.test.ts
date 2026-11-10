/**
 * Saving a page's Look from the Page Designer: same access check as a
 * publish, only fields the page's Look shows, the Studio's own validated
 * write, and a refusal when the Studio changed a field since the editor
 * opened. Publishing checks the design BEFORE saving any colour.
 */

import { createWidget } from '@/lib/hero-builder/defaults'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'

import { column, designOf, section } from '../hero-builder/helpers'

const mockVerify = jest.fn()
const mockUpdate = jest.fn()
const mockSingle = jest.fn()
const mockCurrent = jest.fn()
const mockSaveBranding = jest.fn()
const mockSelect = jest.fn()

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: jest.fn() }))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }))
jest.mock('@/lib/branding-write', () => ({ saveBrandingWithClient: (...args: unknown[]) => mockSaveBranding(...args) }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const builder = {
        update: (patch: unknown) => {
          mockUpdate(patch)
          return builder
        },
        eq: () => builder,
        select: (columns: string) => {
          mockSelect(columns)
          return builder
        },
        single: () => mockSingle(),
        maybeSingle: () => mockCurrent(),
      }
      return builder
    },
  }),
}))

const load = () => import('@/app/actions/page-designer')

const SAVED_ROW = { id: 't1', checkout_accent_color: '#111111', tracking_style: { accent: '#ff0000', corners: 'round' } }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockVerify.mockResolvedValue({})
  mockSingle.mockResolvedValue({ data: { id: 't1', slug: 'real-slug' }, error: null })
  mockCurrent.mockResolvedValue({ data: SAVED_ROW, error: null })
  mockSaveBranding.mockResolvedValue({ success: true })
})

describe('savePageLookAction', () => {
  it('writes the changed fields through the Studio’s own branding write, JSON columns folded over the saved value', async () => {
    const result = await (await load()).savePageLookAction('t1', 'tracking', {
      changes: { 'tracking_style.accent': '#00aa00' },
      base: { 'tracking_style.accent': '#ff0000' },
    })
    expect(result).toEqual({ success: true })
    expect(mockVerify).toHaveBeenCalledWith('t1', 'store_setup')
    expect(mockSelect).toHaveBeenCalledWith('id, tracking_style')
    const [, tenantId, patch] = mockSaveBranding.mock.calls[0]
    expect(tenantId).toBe('t1')
    expect(patch).toEqual({ tracking_style: { accent: '#00aa00', corners: 'round' } })
  })

  it('refuses a field that is not part of the page’s Look, without reading or writing', async () => {
    const result = await (await load()).savePageLookAction('t1', 'checkout', {
      changes: { is_prelaunch: false },
      base: { is_prelaunch: true },
    })
    expect(result.success).toBe(false)
    expect(mockCurrent).not.toHaveBeenCalled()
    expect(mockSaveBranding).not.toHaveBeenCalled()
  })

  it('refuses a malformed field name before touching the database', async () => {
    const result = await (await load()).savePageLookAction('t1', 'checkout', {
      changes: { 'checkout_accent_color, password': '#000000' },
      base: {},
    })
    expect(result.success).toBe(false)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('refuses when Branding Studio changed the field since the editor opened', async () => {
    const result = await (await load()).savePageLookAction('t1', 'checkout', {
      changes: { checkout_accent_color: '#222222' },
      base: { checkout_accent_color: '#999999' },
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/changed in Branding Studio/)
    expect(mockSaveBranding).not.toHaveBeenCalled()
  })

  it('reports a store row it cannot read (RLS: no row) as a failure', async () => {
    mockCurrent.mockResolvedValue({ data: null, error: null })
    const result = await (await load()).savePageLookAction('t1', 'checkout', {
      changes: { checkout_accent_color: '#222222' },
      base: { checkout_accent_color: '#111111' },
    })
    expect(result.success).toBe(false)
    expect(mockSaveBranding).not.toHaveBeenCalled()
  })

  it('passes the branding write’s refusal through', async () => {
    mockSaveBranding.mockResolvedValue({ success: false, error: 'Invalid colour' })
    const result = await (await load()).savePageLookAction('t1', 'checkout', {
      changes: { checkout_accent_color: '#222222' },
      base: { checkout_accent_color: '#111111' },
    })
    expect(result).toEqual({ success: false, error: 'Invalid colour' })
  })
})

describe('publishPageDesignAction with a Look', () => {
  const look = { changes: { checkout_accent_color: '#0f766e' }, base: { checkout_accent_color: '#111111' } }

  it('saves the Look, then the design', async () => {
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', createStandardDesign('checkout'), look)
    expect(result).toEqual({ success: true })
    expect(mockSaveBranding).toHaveBeenCalledTimes(1)
    expect(Object.keys(mockUpdate.mock.calls[0][0] as object).sort()).toEqual(['checkout_design', 'checkout_design_enabled'])
  })

  it('saves no colour when the design is refused', async () => {
    const headingOnly = designOf([section('s', [column('c', [createWidget('heading')])])])
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', headingOnly, look)
    expect(result.success).toBe(false)
    expect(mockSaveBranding).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does not publish the design when the Look is refused', async () => {
    const stale = { changes: { checkout_accent_color: '#0f766e' }, base: { checkout_accent_color: '#999999' } }
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', createStandardDesign('checkout'), stale)
    expect(result.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
