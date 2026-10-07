/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'

const createTenantSupabase = jest.fn()
const createTenantOwnerWithClient = jest.fn()
const attachOnboardingTenant = jest.fn()
const claimOnboardingSubmit = jest.fn()
const releaseOnboardingSubmit = jest.fn()

jest.mock('@/lib/tenants-service', () => ({
  createTenantSupabase: (...args: unknown[]) => createTenantSupabase(...args),
  isSlugTaken: async () => false,
}))
jest.mock('@/lib/tenant-owner-provisioning', () => ({
  createTenantOwnerWithClient: (...args: unknown[]) => createTenantOwnerWithClient(...args),
}))
jest.mock('@/lib/onboarding/repository', () => ({
  attachOnboardingTenant: (...args: unknown[]) => attachOnboardingTenant(...args),
  claimOnboardingSubmit: (...args: unknown[]) => claimOnboardingSubmit(...args),
  releaseOnboardingSubmit: (...args: unknown[]) => releaseOnboardingSubmit(...args),
}))

interface Write { table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }

function fakeAdmin() {
  const writes: Write[] = []
  const client = {
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
    from(table: string) {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { email: 'o@x.ph', name: 'Owner' }, error: null }) }) }),
        update(patch: Record<string, unknown>) {
          const write: Write = { table, patch, filters: [] }
          writes.push(write)
          const chain = {
            eq: (column: string, value: unknown) => { write.filters.push([column, value]); return chain },
            then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
          }
          return chain
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
      }
    },
  } as unknown as SupabaseClient
  return { client, writes }
}

const ONBOARDING = {
  id: 'onb-1', checkoutLeadId: 'lead-1', tenantId: null, status: 'awaiting_details', answers: null,
  assets: {}, steps: {}, summary: null, error: null, attempts: 0, launchRequestedAt: null,
  createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
} as const

const ANSWERS = { storeName: 'Kape Tayo', storeType: 'restaurant' } as never

beforeEach(() => {
  jest.clearAllMocks()
  claimOnboardingSubmit.mockResolvedValue(true)
  createTenantSupabase.mockResolvedValue({ id: 'tenant-1' })
  createTenantOwnerWithClient.mockResolvedValue({ userId: 'user-1' })
  attachOnboardingTenant.mockResolvedValue(undefined)
})

describe('provisionStore', () => {
  test('links the lead to its store but only moves an initiated lead to setup_in_progress', async () => {
    // Arrange
    const { provisionStore } = await import('@/lib/onboarding/provision')
    const { client, writes } = fakeAdmin()

    // Act
    await provisionStore(client as never, { ...ONBOARDING }, ANSWERS, 'secret-password')

    // Assert: a lead staff already marked paid (or cancelled) keeps its status.
    const leadWrites = writes.filter((write) => write.table === 'checkout_leads')
    const statusWrites = leadWrites.filter((write) => 'status' in write.patch)
    expect(statusWrites).toHaveLength(1)
    expect(statusWrites[0].patch.status).toBe('setup_in_progress')
    expect(statusWrites[0].filters).toEqual(expect.arrayContaining([['id', 'lead-1'], ['status', 'initiated']]))
    const linkWrite = leadWrites.find((write) => write.patch.tenant_id === 'tenant-1')
    expect(linkWrite).toBeDefined()
    expect(linkWrite!.patch).not.toHaveProperty('status')
  })

  test('a database failure reaches the buyer as a generic message, never the raw cause', async () => {
    // Arrange
    const { provisionStore } = await import('@/lib/onboarding/provision')
    const { isBuyerFacingError } = await import('@/lib/onboarding/errors')
    attachOnboardingTenant.mockRejectedValue(new Error('The new store could not be linked to its set-up: duplicate key value violates unique constraint "store_onboardings_tenant_id_key"'))
    const { client } = fakeAdmin()
    jest.spyOn(console, 'error').mockImplementation(() => undefined)

    // Act
    const failure = await provisionStore(client as never, { ...ONBOARDING }, ANSWERS, 'pw').catch((error: unknown) => error)

    // Assert
    expect(isBuyerFacingError(failure)).toBe(true)
    expect((failure as Error).message).not.toMatch(/duplicate key|constraint/)
    expect(releaseOnboardingSubmit).toHaveBeenCalledWith(client, 'onb-1', (failure as Error).message)
  })

  test('a buyer-facing reason (login already exists) is kept', async () => {
    const { provisionStore } = await import('@/lib/onboarding/provision')
    createTenantOwnerWithClient.mockRejectedValue(new Error('User already registered'))
    const { client } = fakeAdmin()

    const failure = await provisionStore(client as never, { ...ONBOARDING }, ANSWERS, 'pw').catch((error: unknown) => error)

    expect((failure as Error).message).toMatch(/already has a WebNegosyo login/)
  })
})
