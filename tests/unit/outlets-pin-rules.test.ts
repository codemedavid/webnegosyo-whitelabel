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
const findById = jest.fn()
const OUTLET_ID = '7d0f8a7e-2b8c-4d6e-9a51-3f2c1b0e9d84'
/** The branch as stored before the patch. */
const STORED = { id: OUTLET_ID, latitude: 14.0969, longitude: 121.1381, supports_delivery: true }

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
    findById: (...args: unknown[]) => findById(...(args as [])),
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
  findById.mockResolvedValue(STORED)
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

  test('reads a stale Lalamove market on a store without Lalamove as the Philippines', async () => {
    storeRow = { lalamove_enabled: false, lalamove_market: 'HK', distance_delivery_enabled: true }
    const foreign = await createOutletAction('t1', 'cafe', { ...BRANCH, latitude: 22.3193, longitude: 114.1694 } as never)
    expect(foreign).toEqual({ success: false, error: expect.stringContaining('outside the Philippines') })
    const home = await createOutletAction('t1', 'cafe', BRANCH as never)
    expect(home.success).toBe(true)
  })

  test('treats a branch saved without supports_delivery as delivering, like the column default', async () => {
    const withoutDelivery: Partial<typeof BRANCH> = { ...BRANCH, latitude: null as never, longitude: null as never }
    delete withoutDelivery.supports_delivery
    const result = await createOutletAction('t1', 'cafe', withoutDelivery as never)
    expect(result).toEqual({ success: false, error: expect.stringContaining("Pin this branch's location") })
    expect(create).not.toHaveBeenCalled()
  })

  test('lets a delivering branch save without a pin when the store prices neither way', async () => {
    storeRow = { lalamove_enabled: false, lalamove_market: 'PH', distance_delivery_enabled: false }
    const result = await createOutletAction('t1', 'cafe', { ...BRANCH, latitude: null, longitude: null } as never)
    expect(result.success).toBe(true)
  })

  test('requires the pin for distance pricing too', async () => {
    storeRow = { lalamove_enabled: false, lalamove_market: 'PH', distance_delivery_enabled: true }
    const result = await createOutletAction('t1', 'cafe', { ...BRANCH, latitude: null, longitude: null } as never)
    expect(result.success).toBe(false)
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
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { latitude: 22.3193, longitude: 114.1694 })
    expect(result.success).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  test('refuses half a pin', async () => {
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { latitude: 14.09 })
    expect(result).toEqual({ success: false, error: expect.stringContaining('incomplete') })
  })

  test('lets a patch switch delivery on without resending the stored pin', async () => {
    findById.mockResolvedValue({ ...STORED, supports_delivery: false })
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { supports_delivery: true })
    expect(result.success).toBe(true)
  })

  test('refuses switching delivery on for a branch that has no stored pin', async () => {
    findById.mockResolvedValue({ ...STORED, latitude: null, longitude: null, supports_delivery: false })
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { supports_delivery: true })
    expect(result).toEqual({ success: false, error: expect.stringContaining("Pin this branch's location") })
    expect(update).not.toHaveBeenCalled()
  })

  test('refuses clearing the pin of a branch that still delivers', async () => {
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { latitude: null, longitude: null })
    expect(result).toEqual({ success: false, error: expect.stringContaining("Pin this branch's location") })
    expect(update).not.toHaveBeenCalled()
  })

  test('lets a branch clear its pin when the same patch makes it pickup-only', async () => {
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { latitude: null, longitude: null, supports_delivery: false })
    expect(result.success).toBe(true)
  })

  test('lets an unpinned branch stop delivering', async () => {
    findById.mockResolvedValue({ ...STORED, latitude: null, longitude: null })
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { supports_delivery: false })
    expect(result.success).toBe(true)
  })

  test('refuses a patch for a branch this store does not have', async () => {
    findById.mockResolvedValue(null)
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { latitude: 14.1, longitude: 121.1 })
    expect(result).toEqual({ success: false, error: 'Branch not found.' })
    expect(update).not.toHaveBeenCalled()
  })

  test('refuses rather than guess when the stored branch cannot be read', async () => {
    findById.mockRejectedValue(new Error('timeout'))
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { supports_delivery: true })
    expect(result).toEqual({ success: false, error: expect.stringContaining('try again') })
    expect(update).not.toHaveBeenCalled()
  })

  test('refuses an outlet id that is not a uuid before any read', async () => {
    const result = await updateOutletAction('t1', 'cafe', 'not-a-uuid', { is_active: false })
    expect(result).toEqual({ success: false, error: 'Branch not found.' })
    expect(findById).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  test('leaves a patch that does not touch the pin alone', async () => {
    storeError = { message: 'would refuse if read' }
    const result = await updateOutletAction('t1', 'cafe', OUTLET_ID, { is_active: false })
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
