import { createWidget } from '@/lib/hero-builder/defaults'
import type { Widget } from '@/lib/hero-builder/types'

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

const load = () => import('@/app/actions/welcome-builder')

const withEntry = () => designOf([section('s', [column('c', [createWidget('order-entry')])])])
const headingOnly = (): ReturnType<typeof designOf> => designOf([section('s', [column('c', [createWidget('heading') as Widget])])])

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockVerify.mockResolvedValue({})
  mockSingle.mockResolvedValue({ data: { id: 't1', slug: 'real-slug' }, error: null })
})

describe('publishWelcomeDesignAction', () => {
  it('stores the design as text, switches the page on and refreshes the real slug', async () => {
    const result = await (await load()).publishWelcomeDesignAction('t1', withEntry())
    expect(result).toEqual({ success: true })
    expect(mockVerify).toHaveBeenCalledWith('t1', 'store_setup')
    const patch = mockUpdate.mock.calls[0][0] as { welcome_design: string; welcome_design_enabled: boolean }
    expect(typeof patch.welcome_design).toBe('string')
    expect(JSON.parse(patch.welcome_design).version).toBe(5)
    expect(patch.welcome_design_enabled).toBe(true)
    expect(mockInvalidate).toHaveBeenCalledWith('real-slug', 't1')
  })

  it('refuses a page with no way to start ordering, before writing anything', async () => {
    const result = await (await load()).publishWelcomeDesignAction('t1', headingOnly())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/How to order/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses an invalid or empty design', async () => {
    expect((await (await load()).publishWelcomeDesignAction('t1', { version: 4 })).success).toBe(false)
    expect((await (await load()).publishWelcomeDesignAction('t1', designOf([]))).error).toMatch(/at least one section/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('reports a silent RLS refusal (no row back) as a failure', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    const result = await (await load()).publishWelcomeDesignAction('t1', withEntry())
    expect(result.success).toBe(false)
    expect(mockInvalidate).not.toHaveBeenCalled()
  })

  it('stops a caller without store_setup', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const result = await (await load()).publishWelcomeDesignAction('t1', withEntry())
    expect(result).toEqual({ success: false, error: 'Your account can’t change the welcome page. Ask the store owner for Store setup access.' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('tells a signed-out editor to sign in again instead of showing the auth error', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized: Not authenticated'))
    const result = await (await load()).publishWelcomeDesignAction('t1', withEntry())
    expect(result).toEqual({ success: false, error: 'Your session has ended. Sign in again, then publish.' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('unpublishWelcomeDesignAction', () => {
  it('only switches the page off and keeps the design', async () => {
    const result = await (await load()).unpublishWelcomeDesignAction('t1')
    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({ welcome_design_enabled: false })
  })
})
