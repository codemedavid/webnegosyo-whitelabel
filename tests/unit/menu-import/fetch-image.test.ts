/**
 * @jest-environment node
 */
import { describe, test, expect } from '@jest/globals'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function fakeFetch(body: Uint8Array | null, init: { status?: number; headers?: Record<string, string> } = {}) {
    return (async () =>
        new Response(body ? new Blob([body as BlobPart]) : null, { status: init.status ?? 200, headers: init.headers })) as unknown as typeof fetch
}

async function load() {
    return import('@/lib/menu-import/fetch-image')
}

describe('fetchImageBuffer', () => {
    test('returns the bytes and the mime judged from them', async () => {
        const { fetchImageBuffer } = await load()
        const result = await fetchImageBuffer('https://ik.imagekit.io/x/logo.png', { fetchImpl: fakeFetch(PNG_BYTES) })
        expect(result.mime).toBe('image/png')
        expect(result.buffer.byteLength).toBe(PNG_BYTES.byteLength)
    })

    test('refuses a non-https URL before fetching', async () => {
        const { fetchImageBuffer } = await load()
        let called = false
        const spy = (async () => { called = true; return new Response(null) }) as unknown as typeof fetch
        await expect(fetchImageBuffer('http://example.com/a.png', { fetchImpl: spy })).rejects.toThrow(/https/)
        await expect(fetchImageBuffer('not a url', { fetchImpl: spy })).rejects.toThrow(/valid URL/)
        expect(called).toBe(false)
    })

    test('refuses a declared content-length over the cap', async () => {
        const { fetchImageBuffer } = await load()
        const fetchImpl = fakeFetch(PNG_BYTES, { headers: { 'content-length': '999999' } })
        await expect(fetchImageBuffer('https://x.test/a.png', { fetchImpl, maxBytes: 100 })).rejects.toThrow(/larger than/)
    })

    test('refuses actual bytes over the cap even when no length is declared', async () => {
        const { fetchImageBuffer } = await load()
        await expect(
            fetchImageBuffer('https://x.test/a.png', { fetchImpl: fakeFetch(PNG_BYTES), maxBytes: 4 }),
        ).rejects.toThrow(/larger than/)
    })

    test('refuses bytes that are not JPEG/PNG/WEBP', async () => {
        const { fetchImageBuffer } = await load()
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
        await expect(fetchImageBuffer('https://x.test/a.svg', { fetchImpl: fakeFetch(svg) })).rejects.toThrow(/JPEG, PNG or WEBP/)
    })

    test('reports an HTTP failure', async () => {
        const { fetchImageBuffer } = await load()
        await expect(
            fetchImageBuffer('https://x.test/a.png', { fetchImpl: fakeFetch(null, { status: 404 }) }),
        ).rejects.toThrow(/HTTP 404/)
    })

    test('times out a fetch that never answers', async () => {
        const { fetchImageBuffer } = await load()
        const hanging = ((_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            })) as unknown as typeof fetch
        await expect(fetchImageBuffer('https://x.test/a.png', { fetchImpl: hanging, timeoutMs: 10 })).rejects.toThrow(/timed out/)
    })
})

describe('fetchImageAsDataUrl', () => {
    test('encodes the image as a base64 data URL', async () => {
        const { fetchImageAsDataUrl } = await load()
        const url = await fetchImageAsDataUrl('https://x.test/a.png', { fetchImpl: fakeFetch(PNG_BYTES) })
        expect(url).toBe(`data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`)
    })
})
