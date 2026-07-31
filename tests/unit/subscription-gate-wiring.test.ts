/**
 * The subscription gate is on the door, not just on the sign.
 *
 * `assertSubscriptionActive` was written to be "the actual boundary" — its own
 * module comment says so — and then never called from anywhere. The only thing
 * standing between a paused merchant and every admin write was the layout-s
 * `redirect()`, which is a rendering decision: it does not stop a POST aimed
 * straight at a server action.
 *
 * It now runs inside `verifyTenantAdmin`, which every admin write in the
 * product funnels through, so no future action can forget to call it.
 */

const getUser = jest.fn()
const appUserRow = jest.fn()
const subscriptionRow = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser },
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          maybeSingle: () =>
            table === 'tenant_subscriptions' ? subscriptionRow() : appUserRow(),
          single: () => appUserRow(),
        }
        chain.select = () => chain
        chain.eq = () => chain
        return chain
      },
    }),
}))

jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: () => appUserRow(),
}))

import { verifyTenantAdmin } from '@/lib/admin-service'
import { SUBSCRIPTION_PAUSED_MESSAGE } from '@/lib/billing/subscription-gate'

const TENANT = 't1'

/** A subscription whose grace ran out long ago. */
const LAPSED = {
  tenant_id: TENANT,
  status: 'active',
  monthly_price_php: 649,
  paid_through: '2020-01-01',
  grace_days: 3,
}

const CURRENT = { ...LAPSED, paid_through: '2999-01-01' }

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  appUserRow.mockResolvedValue({
    appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: null },
    error: null,
  })
})

describe('a paused merchant cannot write through the back door', () => {
  test('refuses an admin whose subscription has lapsed', async () => {
    // Arrange
    subscriptionRow.mockResolvedValue({ data: LAPSED, error: null })

    // Act + Assert — the message is the merchant-facing one, because whoever
    // sees it is standing in a restaurant and cannot fix it themselves.
    await expect(verifyTenantAdmin(TENANT)).rejects.toThrow(SUBSCRIPTION_PAUSED_MESSAGE)
  })

  test('lets a paid-up admin through', async () => {
    subscriptionRow.mockResolvedValue({ data: CURRENT, error: null })

    await expect(verifyTenantAdmin(TENANT)).resolves.toMatchObject({
      userRole: { role: 'admin' },
    })
  })

  test('never locks out a superadmin, who is the only one who can clear it', async () => {
    // A gate that locks out its own remedy cannot be fixed from inside the
    // product.
    subscriptionRow.mockResolvedValue({ data: LAPSED, error: null })
    appUserRow.mockResolvedValue({
      appUser: { role: 'superadmin', tenant_id: null, is_owner: false, permissions: null },
      error: null,
    })

    await expect(verifyTenantAdmin(TENANT)).resolves.toMatchObject({
      userRole: { role: 'superadmin' },
    })
  })

  test('fails OPEN when the subscription cannot be read', async () => {
    // A database blip must leave merchants working rather than locking out the
    // whole platform at once. `fetchSubscription` returns null on any query
    // error and null reads as "not blocked".
    appUserRow.mockResolvedValue({
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: null },
      error: null,
    })
    subscriptionRow.mockResolvedValue({ data: null, error: new Error('connection reset') })

    await expect(verifyTenantAdmin(TENANT)).resolves.toMatchObject({
      userRole: { role: 'admin' },
    })
  })

  test('a tenant with no subscription row at all is unblocked', async () => {
    // An unconfigured account is not a delinquent one.
    subscriptionRow.mockResolvedValue({ data: null, error: null })

    await expect(verifyTenantAdmin(TENANT)).resolves.toMatchObject({
      userRole: { role: 'admin' },
    })
  })
})
