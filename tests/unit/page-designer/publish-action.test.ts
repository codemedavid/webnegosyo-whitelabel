import { createWidget } from '@/lib/hero-builder/defaults'
import { createStandardDesign } from '@/lib/page-designer/standard-designs'

import { column, designOf, section } from '../hero-builder/helpers'

const mockVerify = jest.fn()
const mockUpdate = jest.fn()
const mockSingle = jest.fn()
const mockInvalidate = jest.fn()

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/cache', () => ({ invalidateTenantCache: (...args: unknown[]) => mockInvalidate(...args) }))
jest.mock('@/lib/storefront/revalidate', () => ({ revalidateStorefrontMenu: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const builder = {
        update: (patch: unknown) => {
          mockUpdate(patch)
          return builder
        },
        eq: () => builder,
        select: () => builder,
        single: () => mockSingle(),
      }
      return builder
    },
  }),
}))

const load = () => import('@/app/actions/page-designer')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockVerify.mockResolvedValue({})
  mockSingle.mockResolvedValue({ data: { id: 't1', slug: 'real-slug' }, error: null })
})

describe('publishPageDesignAction', () => {
  it('stores the design as text on the page’s own columns and refreshes the real slug', async () => {
    const result = await (await load()).publishPageDesignAction('t1', 'tracking', createStandardDesign('tracking'))
    expect(result).toEqual({ success: true })
    expect(mockVerify).toHaveBeenCalledWith('t1', 'store_setup')
    const patch = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['tracking_design', 'tracking_design_enabled'])
    expect(JSON.parse(patch.tracking_design as string).version).toBe(5)
    expect(patch.tracking_design_enabled).toBe(true)
    expect(mockInvalidate).toHaveBeenCalledWith('real-slug', 't1')
  })

  it('refuses an unknown page before checking access or writing', async () => {
    const result = await (await load()).publishPageDesignAction('t1', 'hero_design', createStandardDesign('tracking'))
    expect(result.success).toBe(false)
    expect(mockVerify).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses a checkout without its required blocks, before writing anything', async () => {
    const headingOnly = designOf([section('s', [column('c', [createWidget('heading')])])])
    const result = await (await load()).publishPageDesignAction('t1', 'checkout', headingOnly)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/must show/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('reports an RLS refusal (no row) as a failure', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    const result = await (await load()).publishPageDesignAction('t1', 'confirmation', createStandardDesign('confirmation'))
    expect(result.success).toBe(false)
    expect(mockInvalidate).not.toHaveBeenCalled()
  })

  it('turns an access refusal into what to do', async () => {
    mockVerify.mockRejectedValue(new Error('Forbidden: missing permission'))
    const result = await (await load()).publishPageDesignAction('t1', 'tracking', createStandardDesign('tracking'))
    expect(result.error).toMatch(/Store setup access/)
  })
})

describe('unpublishPageDesignAction', () => {
  it('only clears the page’s enabled flag', async () => {
    await (await load()).unpublishPageDesignAction('t1', 'checkout')
    expect(mockUpdate).toHaveBeenCalledWith({ checkout_design_enabled: false })
  })
})

describe('saveConfirmationRedirectAction', () => {
  it('saves a valid hand-off', async () => {
    const result = await (await load()).saveConfirmationRedirectAction('t1', { mode: 'countdown', seconds: 8 })
    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({ confirmation_redirect: 'countdown', confirmation_redirect_seconds: 8 })
  })

  it.each([
    { mode: 'countdown', seconds: 2 },
    { mode: 'countdown', seconds: 61 },
    { mode: 'forever', seconds: 5 },
    { mode: 'stay', seconds: 5, extra: true },
  ])('refuses %o without writing', async (setting) => {
    const result = await (await load()).saveConfirmationRedirectAction('t1', setting)
    expect(result.success).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
