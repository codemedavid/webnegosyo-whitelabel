/**
 * Download an image the platform stored (a logo, a menu photo) so server code
 * can read it: feed it to the vision model as a data URL, or decode it.
 *
 * Bounded on every axis a slow or hostile URL could abuse: https only, a
 * timeout, a byte cap checked against the declared length AND the bytes that
 * actually arrive, and a type judged by the bytes (JPEG/PNG/WEBP only).
 */

import { detectImageMime, type DetectedImageMime } from '@/lib/imagekit-signature'

export const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 15_000
export const DEFAULT_IMAGE_MAX_BYTES = 4 * 1024 * 1024

export interface FetchImageOptions {
    maxBytes?: number
    timeoutMs?: number
    fetchImpl?: typeof fetch
}

export interface FetchedImage {
    buffer: Buffer
    mime: DetectedImageMime
}

function assertHttpsUrl(url: string): void {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        throw new Error('Image URL is not a valid URL.')
    }
    if (parsed.protocol !== 'https:') throw new Error('Image URL must use https.')
}

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer> {
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > maxBytes) {
                await reader.cancel().catch(() => {})
                throw new Error(`Image is larger than ${maxBytes} bytes.`)
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }
    return Buffer.concat(chunks)
}

export async function fetchImageBuffer(url: string, opts: FetchImageOptions = {}): Promise<FetchedImage> {
    assertHttpsUrl(url)
    const maxBytes = opts.maxBytes ?? DEFAULT_IMAGE_MAX_BYTES
    const fetchImpl = opts.fetchImpl ?? fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_IMAGE_FETCH_TIMEOUT_MS)

    try {
        let response: Response
        try {
            response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' })
        } catch (error) {
            if (controller.signal.aborted) throw error
            throw new Error(`Image download failed: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}.`)

        const declared = Number(response.headers.get('content-length') ?? '')
        if (Number.isFinite(declared) && declared > maxBytes) {
            throw new Error(`Image is larger than ${maxBytes} bytes.`)
        }
        if (!response.body) throw new Error('Image download returned no body.')

        const buffer = await readCapped(response.body, maxBytes)
        if (buffer.byteLength === 0) throw new Error('Image download returned an empty file.')

        const mime = detectImageMime(buffer)
        if (!mime) throw new Error('Image must be a JPEG, PNG or WEBP file.')
        return { buffer, mime }
    } catch (error) {
        // A timeout mid-body surfaces as an AbortError from the stream reader.
        if (controller.signal.aborted) throw new Error('Image download timed out.')
        throw error
    } finally {
        clearTimeout(timer)
    }
}

export async function fetchImageAsDataUrl(url: string, opts: FetchImageOptions = {}): Promise<string> {
    const { buffer, mime } = await fetchImageBuffer(url, opts)
    return `data:${mime};base64,${buffer.toString('base64')}`
}
