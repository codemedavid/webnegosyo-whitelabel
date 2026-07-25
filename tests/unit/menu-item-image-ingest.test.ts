import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// setMenuItemImageFromUrl is the MCP path for "here is a link to the photo":
// fetch the bytes, re-host them on ImageKit, then point the menu item at the
// ImageKit URL. The row must never be written when the fetch or the upload fails,
// otherwise the menu ends up advertising a broken image.

jest.mock('@/lib/supabase/server', () => ({
    __esModule: true,
    createClient: jest.fn(async () => {
        throw new Error('cookie createClient should not be called on the MCP path')
    }),
}))
jest.mock('@/lib/imagekit-remote', () => ({
    __esModule: true,
    fetchRemoteImageAsBase64: jest.fn(),
}))
jest.mock('@/lib/imagekit-server', () => ({
    __esModule: true,
    uploadBase64ToImageKit: jest.fn(),
}))

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
const { fetchRemoteImageAsBase64 } = jest.requireMock('@/lib/imagekit-remote') as any
const { uploadBase64ToImageKit } = jest.requireMock('@/lib/imagekit-server') as any
const { setMenuItemImageFromUrl } = require('@/lib/admin-service')
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'
const HOSTED = 'https://ik.imagekit.io/demo/menu-items/d1_abc.png'

/** Fake service-role client capturing the update chain on menu_items. */
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
    fetchRemoteImageAsBase64.mockReset().mockResolvedValue({
        base64: 'AAAA',
        contentType: 'image/png',
        fileName: 'd1.png',
    } as never)
    uploadBase64ToImageKit.mockReset().mockResolvedValue({
        url: HOSTED,
        fileId: 'file_1',
        filePath: 'menu-items/d1_abc.png',
    } as never)
})

describe('setMenuItemImageFromUrl', () => {
    it('fetches the remote image, re-hosts it on ImageKit and stores the ImageKit url', async () => {
        const { ctx, from, update } = makeUpdateStub({ id: ITEM, image_url: HOSTED })

        const result = await setMenuItemImageFromUrl(ITEM, TENANT, 'https://cdn.example.com/menu/d1.png', undefined, ctx)

        expect(fetchRemoteImageAsBase64).toHaveBeenCalledWith('https://cdn.example.com/menu/d1.png', undefined)
        expect(uploadBase64ToImageKit).toHaveBeenCalledWith(
            'AAAA',
            expect.objectContaining({ folder: `menu-items/${TENANT}`, fileName: 'd1.png' }),
        )
        expect(from).toHaveBeenCalledWith('menu_items')
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ image_url: HOSTED }))
        expect(result).toEqual({ id: ITEM, image_url: HOSTED })
    })

    it('passes an explicit file name through to the fetch so codes like D1 are preserved', async () => {
        const { ctx } = makeUpdateStub({ id: ITEM, image_url: HOSTED })

        await setMenuItemImageFromUrl(ITEM, TENANT, 'https://cdn.example.com/x', 'D1-sizzling-sisig.png', undefined, ctx)

        expect(fetchRemoteImageAsBase64).toHaveBeenCalledWith('https://cdn.example.com/x', 'D1-sizzling-sisig.png')
    })

    it('never writes the row when the remote fetch fails', async () => {
        fetchRemoteImageAsBase64.mockRejectedValue(new Error('Remote file is not an image (text/html).') as never)
        const { ctx, update } = makeUpdateStub({ id: ITEM })

        await expect(
            setMenuItemImageFromUrl(ITEM, TENANT, 'https://drive.google.com/file/d/1/view', undefined, ctx),
        ).rejects.toThrow(/not an image/i)
        expect(update).not.toHaveBeenCalled()
    })

    it('never writes the row when the ImageKit upload fails', async () => {
        uploadBase64ToImageKit.mockRejectedValue(new Error('ImageKit upload failed (500).') as never)
        const { ctx, update } = makeUpdateStub({ id: ITEM })

        await expect(
            setMenuItemImageFromUrl(ITEM, TENANT, 'https://cdn.example.com/d1.png', undefined, ctx),
        ).rejects.toThrow(/ImageKit upload failed/)
        expect(update).not.toHaveBeenCalled()
    })
})
