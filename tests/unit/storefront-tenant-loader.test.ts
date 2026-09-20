/**
 * The migration-drift fallback (`*` row after an undefined-column error) must
 * neither be cached nor carry credential columns to the client.
 */
const attempts: Array<{ data: unknown; error: { code?: string; message: string } | null }> = []
const loaderCalls = jest.fn()

jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/lib/supabase/public', () => {
  const actual = jest.requireActual('@/lib/supabase/public')
  const builder = { eq: () => builder, maybeSingle: async () => attempts.shift() ?? { data: null, error: null } }
  return { ...actual, createPublicClient: () => ({ from: () => ({ select: () => { loaderCalls(); return builder } }) }) }
})

describe('getStorefrontTenant', () => {
  beforeEach(() => { attempts.length = 0; loaderCalls.mockClear(); jest.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => jest.restoreAllMocks())

  test('a degraded full-row read is stripped of secrets and not cached', async () => {
    const { getStorefrontTenant } = await import('@/lib/storefront/storefront-tenant')
    attempts.push(
      { data: null, error: { code: '42703', message: 'column tenants.new_col does not exist' } },
      { data: { id: 't', slug: 'cafe', name: 'Cafe', lalamove_secret_key: 'SECRET' }, error: null },
    )

    const result = await getStorefrontTenant('cafe')

    expect(result.tenant).toEqual({ id: 't', slug: 'cafe', name: 'Cafe' })
    expect(result.error).toBeNull()
  })

  test('a timed-out read names the timeout and is not cached', async () => {
    const { getStorefrontTenant } = await import('@/lib/storefront/storefront-tenant')
    attempts.push({ data: null, error: { message: 'AbortError: This operation was aborted' } })

    const result = await getStorefrontTenant('cafe')

    expect(result.tenant).toBeNull()
    expect(result.error).toMatch(/did not answer within/)
  })

  test('an absent tenant is a cacheable null, not an error', async () => {
    const { getStorefrontTenant } = await import('@/lib/storefront/storefront-tenant')
    attempts.push({ data: null, error: null })

    await expect(getStorefrontTenant('nope')).resolves.toEqual({ tenant: null, error: null })
  })
})
