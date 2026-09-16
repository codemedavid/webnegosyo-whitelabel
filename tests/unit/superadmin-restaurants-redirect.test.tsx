/**
 * /superadmin/restaurants — alias for /superadmin/tenants.
 *
 * The sidebar labels the list "Restaurants" but links to /superadmin/tenants,
 * so people type /superadmin/restaurants and hit a 404. The page redirects,
 * carrying a ?q= search through so a shared filtered link keeps working.
 */

const redirect = jest.fn()

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}))

import RestaurantsRedirectPage from '@/app/superadmin/restaurants/page'

describe('/superadmin/restaurants redirect', () => {
  beforeEach(() => redirect.mockClear())

  test('redirects to /superadmin/tenants when no query is given', async () => {
    await RestaurantsRedirectPage({ searchParams: Promise.resolve({}) })

    expect(redirect).toHaveBeenCalledWith('/superadmin/tenants')
  })

  test('forwards ?q= to the tenants list', async () => {
    await RestaurantsRedirectPage({
      searchParams: Promise.resolve({ q: 'seacook' }),
    })

    expect(redirect).toHaveBeenCalledWith('/superadmin/tenants?q=seacook')
  })

  test('drops an empty q rather than emitting a dangling ?q=', async () => {
    await RestaurantsRedirectPage({ searchParams: Promise.resolve({ q: '' }) })

    expect(redirect).toHaveBeenCalledWith('/superadmin/tenants')
  })
})
