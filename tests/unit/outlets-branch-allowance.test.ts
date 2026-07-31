/**
 * A branch allowance the product could not read is not an allowance of one.
 *
 * `fetchOutletLimit` discarded the query error, and `resolveOutletLimit(null)`
 * returns the platform default of 1. So a transient failure — or deploying to
 * an environment where `20260808130000` has not landed and `max_outlets` does
 * not exist at all, a class of drift this platform has shipped more than once —
 * told every multi-branch tenant "This plan includes 1 branch. Contact support
 * to add more." A merchant legitimately running five branches would read that
 * as their plan being downgraded.
 *
 * Still fails closed: no branch is created either way. What changes is that the
 * product stops stating a limit that is not the merchant's.
 */

const appUser = { role: 'admin', tenant_id: 't1', is_owner: true, outlet_id: null }

const tenantRow = jest.fn()
const listByTenant = jest.fn()
const create = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => {
        const chain: Record<string, unknown> = { maybeSingle: () => tenantRow() }
        chain.select = () => chain
        chain.eq = () => chain
        return chain
      },
    }),
}))

jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: () => Promise.resolve({ appUser, error: null }),
}))

jest.mock('@/lib/outlets/supabase-outlet-repository', () => ({
  createSupabaseOutletRepository: () => ({
    listByTenant: (...args: unknown[]) => listByTenant(...(args as [])),
    create: (...args: unknown[]) => create(...(args as [])),
  }),
}))

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { createOutletAction } from '@/app/actions/outlets'

const NEW_BRANCH = { name: 'North', slug: 'north' }

/** A tenant already running three branches. */
const THREE_BRANCHES = [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }]

beforeEach(() => {
  jest.clearAllMocks()
  listByTenant.mockResolvedValue(THREE_BRANCHES)
  create.mockResolvedValue({ id: 'o4', ...NEW_BRANCH })
})

describe('creating a branch when the allowance cannot be read', () => {
  test('says the allowance could not be checked, not that the plan includes 1', async () => {
    // Arrange — the `max_outlets` column is missing, exactly what an unapplied
    // migration looks like from the client.
    tenantRow.mockResolvedValue({
      data: null,
      error: { code: '42703', message: 'column tenants.max_outlets does not exist' },
    })

    // Act
    const result = await createOutletAction('t1', 'cafe', NEW_BRANCH as never)

    // Assert — refused, but honestly. The old message named a limit of 1 to a
    // merchant who is visibly running three.
    expect(result.success).toBe(false)
    expect(result.error).toContain('Could not check how many branches')
    expect(result.error).not.toContain('This plan includes')
    expect(create).not.toHaveBeenCalled()
  })

  test('still fails closed — nothing is created on a failed read', async () => {
    tenantRow.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    await createOutletAction('t1', 'cafe', NEW_BRANCH as never)

    expect(create).not.toHaveBeenCalled()
  })
})

describe('creating a branch when the allowance reads cleanly', () => {
  test('a tenant inside their allowance gets the branch', async () => {
    tenantRow.mockResolvedValue({ data: { max_outlets: 5 }, error: null })

    const result = await createOutletAction('t1', 'cafe', NEW_BRANCH as never)

    expect(result.success).toBe(true)
    expect(create).toHaveBeenCalled()
  })

  test('a tenant at their allowance is refused, naming the real number', async () => {
    tenantRow.mockResolvedValue({ data: { max_outlets: 3 }, error: null })

    const result = await createOutletAction('t1', 'cafe', NEW_BRANCH as never)

    expect(result.success).toBe(false)
    expect(result.error).toContain('This plan includes 3 branches')
    expect(create).not.toHaveBeenCalled()
  })

  test('an unset allowance still falls back to the platform default', async () => {
    // A successful read that finds nothing configured is NOT the error case:
    // an unconfigured allowance must not become a way to mint branches.
    tenantRow.mockResolvedValue({ data: { max_outlets: null }, error: null })

    const result = await createOutletAction('t1', 'cafe', NEW_BRANCH as never)

    expect(result.success).toBe(false)
    expect(result.error).toContain('This plan includes 1 branch')
  })
})
