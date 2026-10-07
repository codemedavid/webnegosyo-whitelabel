import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const verifyTenantPermission = jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({}))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission }))

const createClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const CATEGORY = '22222222-2222-4222-8222-222222222222'

interface UpdateCall {
  values: Record<string, unknown>
  filters: Record<string, unknown>
}

/**
 * A fake Supabase client: one read of the category's dishes, then one update
 * per moved dish. `updateRows` decides how many rows each update reports, so a
 * write RLS silently refused (zero rows, no error) can be simulated.
 */
function fakeClient(
  rows: { id: string; order: number }[],
  { readError = null, updateError = null, updateRows = 1 }: {
    readError?: unknown
    updateError?: unknown
    updateRows?: number
  } = {},
) {
  const updates: UpdateCall[] = []
  const from = jest.fn(() => ({
    select: () => {
      const read = {
        eq: () => read,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: readError ? null : rows, error: readError }),
      }
      return read
    },
    update: (values: Record<string, unknown>) => {
      const call: UpdateCall = { values, filters: {} }
      updates.push(call)
      const chain = {
        eq: (column: string, value: unknown) => {
          call.filters[column] = value
          return chain
        },
        select: async () => ({
          data: updateError ? null : Array.from({ length: updateRows }, () => ({ id: call.filters.id })),
          error: updateError,
        }),
      }
      return chain
    },
  }))
  return { client: { from }, updates }
}

async function loadService() {
  return import('@/lib/menu-item-arrangement-service')
}

describe('reorderMenuItems', () => {
  beforeEach(() => {
    verifyTenantPermission.mockClear()
    createClient.mockReset()
  })

  it('checks the menu permission before touching the database', async () => {
    verifyTenantPermission.mockRejectedValueOnce(new Error('Unauthorized: Missing permission for this feature'))
    const { reorderMenuItems } = await loadService()

    await expect(reorderMenuItems(TENANT, CATEGORY, ['a'])).rejects.toThrow(/permission/i)
    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'menu')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('writes the new position of every moved dish, scoped to the tenant and category', async () => {
    const { client, updates } = fakeClient([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
    ])
    createClient.mockResolvedValue(client as never)
    const { reorderMenuItems } = await loadService()

    await reorderMenuItems(TENANT, CATEGORY, ['b', 'a'])

    expect(updates).toEqual([
      { values: { order: 0 }, filters: { id: 'b', tenant_id: TENANT, category_id: CATEGORY } },
      { values: { order: 1 }, filters: { id: 'a', tenant_id: TENANT, category_id: CATEGORY } },
    ])
  })

  it('refuses a stale arrangement without writing anything', async () => {
    const { client, updates } = fakeClient([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ])
    createClient.mockResolvedValue(client as never)
    const { reorderMenuItems } = await loadService()

    await expect(reorderMenuItems(TENANT, CATEGORY, ['b', 'a'])).rejects.toThrow(/menu changed/i)
    expect(updates).toEqual([])
  })

  it('surfaces a failed read', async () => {
    const { client } = fakeClient([], { readError: { message: 'read failed' } })
    createClient.mockResolvedValue(client as never)
    const { reorderMenuItems } = await loadService()

    await expect(reorderMenuItems(TENANT, CATEGORY, [])).rejects.toMatchObject({ message: 'read failed' })
  })

  it('surfaces a failed write', async () => {
    const { client } = fakeClient([{ id: 'a', order: 5 }], { updateError: { message: 'write failed' } })
    createClient.mockResolvedValue(client as never)
    const { reorderMenuItems } = await loadService()

    await expect(reorderMenuItems(TENANT, CATEGORY, ['a'])).rejects.toMatchObject({ message: 'write failed' })
  })

  it('treats a write that changed no row as a failure, not a success', async () => {
    const { client } = fakeClient([{ id: 'a', order: 5 }], { updateRows: 0 })
    createClient.mockResolvedValue(client as never)
    const { reorderMenuItems } = await loadService()

    await expect(reorderMenuItems(TENANT, CATEGORY, ['a'])).rejects.toThrow(/could not save/i)
  })
})
