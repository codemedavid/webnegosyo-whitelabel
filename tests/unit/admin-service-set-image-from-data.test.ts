import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// setMenuItemImageFromData uploads raw base64 image bytes to ImageKit, then sets
// the resulting hosted URL on the menu item — the path the MCP uses for clients
// that generate image files but have no hosting of their own.

const cookieCreateClient = jest.fn(async () => {
  throw new Error('cookie createClient should not be called on the MCP path')
})
jest.mock('@/lib/supabase/server', () => ({
  createClient: cookieCreateClient,
}))

const uploadBase64ToImageKit =
  jest.fn<(base64: string, opts: { folder: string; fileName: string }) => Promise<unknown>>()
jest.mock('@/lib/imagekit-server', () => ({
  __esModule: true,
  uploadBase64ToImageKit,
}))

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { setMenuItemImageFromData } = require('@/lib/admin-service') as any
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

/** Fake service-role client capturing the update chain for one table. */
function makeUpdateStub(returnedRow: unknown) {
  const single = jest.fn(async () => ({ data: returnedRow, error: null }))
  const select = jest.fn(() => ({ single }))
  const eqTenant = jest.fn(() => ({ select }))
  const eqId = jest.fn(() => ({ eq: eqTenant }))
  const update = jest.fn((_row: unknown) => ({ eq: eqId }))
  const from = jest.fn((_table: string) => ({ update }))
  const client = { from } as unknown as ProvisioningCtx['client']
  return { ctx: { client } as ProvisioningCtx, from, update }
}

beforeEach(() => {
  cookieCreateClient.mockClear()
  uploadBase64ToImageKit.mockReset().mockResolvedValue({
    url: 'https://ik.imagekit.io/demo/menu-items/latte_abc.png',
    fileId: 'file_1',
    filePath: 'menu-items/latte_abc.png',
  })
})

describe('setMenuItemImageFromData (MCP binary-image path)', () => {
  it('uploads the base64 image then sets the hosted url on the item via the injected client', async () => {
    const row = { id: ITEM, image_url: 'https://ik.imagekit.io/demo/menu-items/latte_abc.png' }
    const { ctx, from, update } = makeUpdateStub(row)

    const result = await setMenuItemImageFromData(ITEM, TENANT, 'aGVsbG8=', 'latte.png', ctx)

    expect(uploadBase64ToImageKit).toHaveBeenCalledWith('aGVsbG8=', expect.objectContaining({ fileName: 'latte.png' }))
    expect(from).toHaveBeenCalledWith('menu_items')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: 'https://ik.imagekit.io/demo/menu-items/latte_abc.png' }),
    )
    expect(result).toEqual(row)
    expect(cookieCreateClient).not.toHaveBeenCalled()
  })

  it('does not update the row when the upload fails', async () => {
    uploadBase64ToImageKit.mockRejectedValueOnce(new Error('upload failed'))
    const { ctx, update } = makeUpdateStub({ id: ITEM })

    await expect(setMenuItemImageFromData(ITEM, TENANT, 'aGVsbG8=', 'x.png', ctx)).rejects.toThrow(/upload failed/i)
    expect(update).not.toHaveBeenCalled()
  })
})
