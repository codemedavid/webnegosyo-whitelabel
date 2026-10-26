/** @jest-environment node */
jest.mock('server-only', () => ({}))

describe('isDevIdentityEnabled', () => {
  const load = async () => (await import('@/lib/app-api/tenant-app')).isDevIdentityEnabled

  it('serves the dev store only on a developer machine with a slug configured', async () => {
    const isDevIdentityEnabled = await load()
    expect(isDevIdentityEnabled({ APP_DEV_TENANT_SLUG: 'beracah-cafe' })).toBe(true)
    expect(isDevIdentityEnabled({ APP_DEV_TENANT_SLUG: 'beracah-cafe', VERCEL_ENV: 'development' })).toBe(true)
  })

  it.each([
    [{ APP_DEV_TENANT_SLUG: 'beracah-cafe', VERCEL_ENV: 'production' }],
    [{ APP_DEV_TENANT_SLUG: 'beracah-cafe', VERCEL_ENV: 'preview' }],
    [{ APP_DEV_TENANT_SLUG: '  ' }],
    [{}],
  ])('is off for %p', async (env) => {
    const isDevIdentityEnabled = await load()
    expect(isDevIdentityEnabled(env)).toBe(false)
  })
})
