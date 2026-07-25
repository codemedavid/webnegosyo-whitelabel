import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

// Server-side ingestion of a REMOTE image URL into ImageKit. This is the path the
// MCP needs when an AI client is handed a share link (Google Drive, Dropbox, a
// supplier's CDN) rather than image bytes: storing the foreign URL directly would
// leave the menu pointing at an HTML interstitial or a link that later rots, so
// the bytes are fetched and re-hosted on ImageKit instead.
// `next/jest` stubs the `server-only` import, so the module loads under jest.

/* eslint-disable @typescript-eslint/no-require-imports */
function loadModule() {
    let mod: typeof import('@/lib/imagekit-remote')
    jest.isolateModules(() => {
        mod = require('@/lib/imagekit-remote')
    })
    // @ts-expect-error assigned inside isolateModules
    return mod
}
/* eslint-enable @typescript-eslint/no-require-imports */

const originalFetch = global.fetch

afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
})

/** Minimal Response stand-in for the fields fetchRemoteImageAsBase64 reads. */
function imageResponse(bytes: Uint8Array, contentType = 'image/png', ok = true, status = 200) {
    return {
        ok,
        status,
        headers: new Headers(contentType ? { 'content-type': contentType } : {}),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        text: async () => '',
    } as unknown as Response
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('normalizeRemoteImageUrl', () => {
    it('rewrites a Google Drive file share link to its direct-download form', () => {
        const { normalizeRemoteImageUrl } = loadModule()
        expect(normalizeRemoteImageUrl('https://drive.google.com/file/d/1AbCdEf/view?usp=sharing')).toBe(
            'https://drive.google.com/uc?export=download&id=1AbCdEf',
        )
    })

    it('rewrites a Google Drive open?id= link to its direct-download form', () => {
        const { normalizeRemoteImageUrl } = loadModule()
        expect(normalizeRemoteImageUrl('https://drive.google.com/open?id=XYZ123')).toBe(
            'https://drive.google.com/uc?export=download&id=XYZ123',
        )
    })

    it('rewrites a Dropbox share link to a raw link', () => {
        const { normalizeRemoteImageUrl } = loadModule()
        expect(normalizeRemoteImageUrl('https://www.dropbox.com/s/abc/pizza.jpg?dl=0')).toBe(
            'https://www.dropbox.com/s/abc/pizza.jpg?raw=1',
        )
    })

    it('leaves an ordinary CDN url untouched', () => {
        const { normalizeRemoteImageUrl } = loadModule()
        const url = 'https://cdn.example.com/menu/d1.png'
        expect(normalizeRemoteImageUrl(url)).toBe(url)
    })
})

describe('assertPublicHttpUrl', () => {
    it('accepts an ordinary https url', () => {
        const { assertPublicHttpUrl } = loadModule()
        expect(assertPublicHttpUrl('https://cdn.example.com/a.png').hostname).toBe('cdn.example.com')
    })

    it.each([
        'file:///etc/passwd',
        'ftp://example.com/a.png',
        'http://localhost:3000/a.png',
        'http://127.0.0.1/a.png',
        'http://10.0.0.5/a.png',
        'http://192.168.1.10/a.png',
        'http://172.16.4.4/a.png',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/a.png',
    ])('rejects %s', (url) => {
        const { assertPublicHttpUrl } = loadModule()
        expect(() => assertPublicHttpUrl(url)).toThrow()
    })

    it('rejects a malformed url', () => {
        const { assertPublicHttpUrl } = loadModule()
        expect(() => assertPublicHttpUrl('not a url')).toThrow()
    })
})

describe('fetchRemoteImageAsBase64', () => {
    beforeEach(() => {
        global.fetch = jest.fn(async () => imageResponse(PNG_BYTES)) as unknown as typeof fetch
    })

    it('returns base64 bytes, content type and a derived file name', async () => {
        const { fetchRemoteImageAsBase64 } = loadModule()
        const result = await fetchRemoteImageAsBase64('https://cdn.example.com/menu/d1.png')

        expect(result.base64).toBe(Buffer.from(PNG_BYTES).toString('base64'))
        expect(result.contentType).toBe('image/png')
        expect(result.fileName).toBe('d1.png')
    })

    it('normalizes a Google Drive share link before fetching', async () => {
        const { fetchRemoteImageAsBase64 } = loadModule()
        await fetchRemoteImageAsBase64('https://drive.google.com/file/d/1AbCdEf/view?usp=sharing')

        expect(global.fetch).toHaveBeenCalledWith(
            'https://drive.google.com/uc?export=download&id=1AbCdEf',
            expect.anything(),
        )
    })

    it('prefers an explicit file name hint over the url basename', async () => {
        const { fetchRemoteImageAsBase64 } = loadModule()
        const result = await fetchRemoteImageAsBase64('https://cdn.example.com/menu/d1.png', 'sizzling-sisig.png')
        expect(result.fileName).toBe('sizzling-sisig.png')
    })

    it('falls back to a content-type derived name when the url has no basename', async () => {
        const { fetchRemoteImageAsBase64 } = loadModule()
        const result = await fetchRemoteImageAsBase64('https://drive.google.com/uc?export=download&id=XYZ')
        expect(result.fileName).toMatch(/\.png$/)
    })

    it('rejects a non-image response (e.g. a Drive HTML interstitial)', async () => {
        global.fetch = jest.fn(async () =>
            imageResponse(new Uint8Array([0x3c, 0x68, 0x74]), 'text/html; charset=utf-8'),
        ) as unknown as typeof fetch
        const { fetchRemoteImageAsBase64 } = loadModule()

        await expect(fetchRemoteImageAsBase64('https://drive.google.com/uc?id=XYZ')).rejects.toThrow(/not an image/i)
    })

    it('rejects a non-2xx response', async () => {
        global.fetch = jest.fn(async () =>
            imageResponse(new Uint8Array(), 'image/png', false, 404),
        ) as unknown as typeof fetch
        const { fetchRemoteImageAsBase64 } = loadModule()

        await expect(fetchRemoteImageAsBase64('https://cdn.example.com/missing.png')).rejects.toThrow(/404/)
    })

    it('rejects an empty body', async () => {
        global.fetch = jest.fn(async () => imageResponse(new Uint8Array())) as unknown as typeof fetch
        const { fetchRemoteImageAsBase64 } = loadModule()

        await expect(fetchRemoteImageAsBase64('https://cdn.example.com/empty.png')).rejects.toThrow(/empty/i)
    })

    it('rejects a body larger than the size cap', async () => {
        const { fetchRemoteImageAsBase64, MAX_REMOTE_IMAGE_BYTES } = loadModule()
        global.fetch = jest.fn(async () =>
            imageResponse(new Uint8Array(MAX_REMOTE_IMAGE_BYTES + 1)),
        ) as unknown as typeof fetch

        await expect(fetchRemoteImageAsBase64('https://cdn.example.com/huge.png')).rejects.toThrow(/too large/i)
    })

    it('refuses to fetch a private-network url', async () => {
        const { fetchRemoteImageAsBase64 } = loadModule()
        await expect(fetchRemoteImageAsBase64('http://169.254.169.254/latest/meta-data')).rejects.toThrow()
        expect(global.fetch).not.toHaveBeenCalled()
    })
})
