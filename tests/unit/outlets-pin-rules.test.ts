/**
 * A branch's pin is its Lalamove pickup and the point its delivery fees are
 * measured from, so the branch save checks it like the store's: both halves,
 * inside the Philippines, and present on a delivering branch of a store that
 * prices delivery by distance or books Lalamove.
 */

const appUser = { role: 'admin', tenant_id: 't1', is_owner: true, outlet_id: null }

let storeRow: Record<string, unknown> = {}
let storeError: unknown = null
const create = jest.fn()
const update = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => {
        const chain: Record<string, unknown> = {
          maybeSingle: () => Promise.resolve({ data: storeError ? null : { max_outlets: 10, ...storeRow }, error: storeError }),
        }
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
    listByTenant: () => Promise.resolve([]),
    create: (...args: unknown[]) => create(...(args as [])),
    update: (...args: unknown[]) => update(...(args as [])),
  }),
}))

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { createOutletAction, updateOutletAction } from '@/app/actions/outlets'

const BRANCH = {
  name: 'Tanauan',
  slug: 'tanauan',
  address: 'Gonzales St, Tanauan',
  latitude: 14.0969,
  longitude: 121.1381,
  supports_delivery: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  storeError = null
  storeRow = { lalamove_enabled: true, lalamove_market: 'PH', distance_delivery_enabled: false }
  create.mockResolvedValue({ id: 'o1' })
  update.mockResolvedValue({ id: 'o1' })
})

describe('createOutletAction — branch pin', () => {
  test('saves a delivering branch pinned in the Philippines', async () => {
    const result = await createOutletAction('t1', 'cafe', BRANCH as never)
    expect(result.success).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('refuses a delivering branch with no pin when the store books Lalamove', async () => {
    const result = await createOutletAction('t1', 'cafe', { ...BRANCH, latitude: null, longitude: null } as never)
    expect(result).toEqual({ success: false, error: expect.stringContaining("Pin this branch's location") })
    expect(create).not.toHaveBeenCalled()
  })

  test('lets a pickup-only branch save without a pin', async () => {
    const result = await createOutletAction('t1', 'cafe', { ...BRANCH, latitude: null, longitude: null, supports_delivery: false } as never)
    expect(result.success).toBe(true)
  })

  test('refuses a branch pinned outside the Philippines', async () => {
    const result = await createOutletAction('t1', 'cafe', { ...BRANCH, latitude: 22.3193, longitude: 114.1694 } as never)
    expect(result).toEqual({ success: false, error: expect.stringContaining('outside the Philippines') })
  })

  test('refuses rather than guess when the store settings cannot be read', async () => {
    storeError = { message: 'timeout' }
    const result = await createOutletAction('t1', 'cafe', BRANCH as never)
    expect(result.success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('updateOutletAction — branch pin', () => {
  test('checks a patch that moves the pin', async () => {
    const result = await updateOutletAction('t1', 'cafe', 'o1', { latitude: 22.3193, longitude: 114.1694 })
    expect(result.success).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  test('refuses half a pin', async () => {
    const result = await updateOutletAction('t1', 'cafe', 'o1', { latitude: 14.09 })
    expect(result).toEqual({ success: false, error: expect.stringContaining('incomplete') })
  })

  test('lets a patch switch delivery on without resending the stored pin', async () => {
    const result = await updateOutletAction('t1', 'cafe', 'o1', { supports_delivery: true })
    expect(result.success).toBe(true)
  })

  test('leaves a patch that does not touch the pin alone', async () => {
    storeError = { message: 'would refuse if read' }
    const result = await updateOutletAction('t1', 'cafe', 'o1', { is_active: false })
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
