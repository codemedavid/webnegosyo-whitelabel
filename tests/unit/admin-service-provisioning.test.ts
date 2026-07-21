import { describe, it, expect, jest } from '@jest/globals'

// Mock the cookie-based server client so we can assert it is NOT used on the
// injected-context (MCP) path. If a writer ever falls back to the cookie client
// while a ProvisioningCtx is supplied, this mock records the call and the test
// fails.
const cookieCreateClient = jest.fn(async () => {
  throw new Error('cookie createClient should not be called on the MCP path')
})
jest.mock('@/lib/supabase/server', () => ({
  createClient: cookieCreateClient,
}))

import { createCategory, type CategoryInput } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '11111111-1111-4111-8111-111111111111'

/** Builds a complete, valid CategoryInput (defaults spelled out for the type). */
function categoryInput(overrides: Partial<CategoryInput> = {}): CategoryInput {
  return { name: 'Drinks', order: 0, is_active: true, display_layout: 'grid', default_addons: [], ...overrides }
}

/** Fake service-role client capturing the insert chain for one table. */
function makeInsertStub(returnedRow: unknown) {
  const single = jest.fn(async () => ({ data: returnedRow, error: null }))
  const select = jest.fn(() => ({ single }))
  const insert = jest.fn((_row: unknown) => ({ select }))
  const from = jest.fn((_table: string) => ({ insert }))
  const client = { from } as unknown as ProvisioningCtx['client']
  return { ctx: { client } as ProvisioningCtx, from, insert }
}

describe('createCategory with an injected ProvisioningCtx (MCP path)', () => {
  beforeEach(() => cookieCreateClient.mockClear())

  it('inserts via the injected client and never touches the cookie client', async () => {
    const row = { id: 'cat_1', tenant_id: TENANT, name: 'Drinks' }
    const { ctx, from, insert } = makeInsertStub(row)

    const result = await createCategory(TENANT, categoryInput({ name: 'Drinks' }), ctx)

    expect(result).toEqual(row)
    expect(from).toHaveBeenCalledWith('categories')
    expect(cookieCreateClient).not.toHaveBeenCalled()
  })

  it('injects tenant_id into the inserted row', async () => {
    const { ctx, insert } = makeInsertStub({ id: 'cat_1' })
    await createCategory(TENANT, categoryInput({ name: 'Sides', order: 1 }), ctx)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: TENANT, name: 'Sides' }))
  })

  it('still validates input on the MCP path (rejects too-short name)', async () => {
    const { ctx } = makeInsertStub({ id: 'cat_1' })
    await expect(createCategory(TENANT, categoryInput({ name: 'x' }), ctx)).rejects.toThrow()
  })

  it('surfaces a database error from the injected client', async () => {
    const single = jest.fn(async () => ({ data: null, error: { message: 'insert failed' } }))
    const select = jest.fn(() => ({ single }))
    const insert = jest.fn(() => ({ select }))
    const client = { from: jest.fn(() => ({ insert })) } as unknown as ProvisioningCtx['client']
    await expect(
      createCategory(TENANT, categoryInput({ name: 'Drinks' }), { client }),
    ).rejects.toMatchObject({ message: 'insert failed' })
  })
})
