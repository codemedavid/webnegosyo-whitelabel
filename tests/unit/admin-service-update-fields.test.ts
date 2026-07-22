import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// updateMenuItemFields is the partial-update writer the MCP uses to edit an
// existing item (description, price, variations, addons, ...) WITHOUT resending
// the whole record. Only the fields provided are written; omitted fields are
// left untouched. Runs on the injected service-role client (MCP path).

const cookieCreateClient = jest.fn(async () => {
  throw new Error('cookie createClient should not be called on the MCP path')
})
jest.mock('@/lib/supabase/server', () => ({
  createClient: cookieCreateClient,
}))

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { updateMenuItemFields } = require('@/lib/admin-service') as any
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'
const CATEGORY = '33333333-3333-4333-8333-333333333333'

/** Fake service-role client capturing the update chain for one table. */
function makeUpdateStub(returnedRow: unknown) {
  const single = jest.fn(async () => ({ data: returnedRow, error: null }))
  const select = jest.fn(() => ({ single }))
  const eqTenant = jest.fn(() => ({ select }))
  const eqId = jest.fn(() => ({ eq: eqTenant }))
  const update = jest.fn((_patch: unknown) => ({ eq: eqId }))
  const from = jest.fn((_table: string) => ({ update }))
  const client = { from } as unknown as ProvisioningCtx['client']
  return { ctx: { client } as ProvisioningCtx, from, update }
}

beforeEach(() => {
  cookieCreateClient.mockClear()
})

describe('updateMenuItemFields (MCP partial-update path)', () => {
  it('writes only the provided fields via the injected client and never touches the cookie client', async () => {
    const row = { id: ITEM, description: 'A rich, velvety Biscoff frappe' }
    const { ctx, from, update } = makeUpdateStub(row)

    const result = await updateMenuItemFields(
      ITEM,
      TENANT,
      { description: 'A rich, velvety Biscoff frappe', price: 149 },
      ctx,
    )

    expect(from).toHaveBeenCalledWith('menu_items')
    const patch = (update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(patch).toEqual({ description: 'A rich, velvety Biscoff frappe', price: 149 })
    expect(result).toEqual(row)
    expect(cookieCreateClient).not.toHaveBeenCalled()
  })

  it('does not include omitted fields in the update payload (partial semantics)', async () => {
    const { ctx, update } = makeUpdateStub({ id: ITEM })
    await updateMenuItemFields(ITEM, TENANT, { is_available: false }, ctx)
    const patch = (update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(patch).toEqual({ is_available: false })
    // Fields that carry defaults on the create schema must NOT be injected here.
    expect(patch).not.toHaveProperty('is_featured')
    expect(patch).not.toHaveProperty('order')
    expect(patch).not.toHaveProperty('name')
  })

  it('accepts grouped variation_types and writes them through', async () => {
    const { ctx, update } = makeUpdateStub({ id: ITEM })
    const variation_types = [
      {
        id: 'size',
        name: 'Size',
        is_required: true,
        display_order: 0,
        options: [
          { id: 'm', name: 'Medium', price_modifier: 0, display_order: 0 },
          { id: 'l', name: 'Large', price_modifier: 30, display_order: 1 },
        ],
      },
    ]
    await updateMenuItemFields(ITEM, TENANT, { variation_types }, ctx)
    const patch = (update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(patch).toEqual({ variation_types })
  })

  it('rejects an empty patch (no fields to update)', async () => {
    const { ctx, update } = makeUpdateStub({ id: ITEM })
    await expect(updateMenuItemFields(ITEM, TENANT, {}, ctx)).rejects.toThrow(/no fields/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('still validates provided fields (rejects a too-short description)', async () => {
    const { ctx, update } = makeUpdateStub({ id: ITEM })
    await expect(updateMenuItemFields(ITEM, TENANT, { description: 'short' }, ctx)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts a category_id change', async () => {
    const { ctx, update } = makeUpdateStub({ id: ITEM })
    await updateMenuItemFields(ITEM, TENANT, { category_id: CATEGORY }, ctx)
    const patch = (update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(patch).toEqual({ category_id: CATEGORY })
  })
})
