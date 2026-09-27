import 'server-only'
import { requestPublicImage } from '@/lib/public-image-fetch'

/**
 * Fetch a remote image so it can be re-hosted on ImageKit.
 *
 * The MCP is usually handed a *link* to a photo (a Google Drive share URL, a
 * Dropbox link, a supplier's CDN) rather than image bytes. Writing that foreign
 * URL straight onto a menu item is wrong twice over: share links serve an HTML
 * interstitial instead of an image, and even a working third-party URL rots
 * later. So the bytes are pulled here, validated, and handed to the ImageKit
 * uploader; the menu only ever stores an ImageKit URL.
 *
 * Fetching a caller-supplied URL server-side is an SSRF surface, so the host is
 * checked against loopback/private/link-local ranges before any request is made
 * (`assertPublicHttpUrl`). The MCP is superadmin-authenticated, but that is not
 * a reason to let it read the metadata service.
 */

/** Largest remote image accepted, in bytes. Menu photos are far below this. */
export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024

/** How long to wait for the remote host before giving up. */
const FETCH_TIMEOUT_MS = 20_000

/** Hostnames that must never be fetched, regardless of scheme. */
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]', '::1', 'metadata.google.internal'])

/** IPv4 literals in loopback / private / link-local / unspecified ranges. */
function isPrivateIpv4(hostname: string): boolean {
    const parts = hostname.split('.')
    if (parts.length !== 4) return false
    const octets = parts.map((p) => Number(p))
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false

    const [a, b, c] = octets
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 169 && b === 254) return true // link-local, incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && (b === 168 || b === 0)) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a === 192 && b === 88 && c === 99) return true // deprecated relay range
    if (a === 198 && b === 51 && c === 100) return true // documentation
    if (a === 203 && b === 0 && c === 113) return true // documentation
    return false
}

/** IPv6 literals outside ordinary global unicast, including transition ranges. */
function isPrivateIpv6(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (!host.includes(':')) return false
    // Only ordinary global unicast IPv6 is eligible. This excludes mapped
    // IPv4, NAT64, multicast, loopback and local address ranges.
    if (!/^[23][0-9a-f]{3}:/.test(host)) return true
    // Exclude transition/documentation ranges that can embed other addresses.
    return /^(2001:(:|[0-9a-f]{1,2}:|1[0-9a-f]{2}:|db8:)|2002:)/.test(host)
}

/**
 * Parse `rawUrl` and assert it is a public http(s) address safe to fetch.
 * Throws with a caller-friendly message otherwise.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
    let url: URL
    try {
        url = new URL(rawUrl)
    } catch {
        throw new Error(`Not a valid URL: ${rawUrl}`)
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Only http(s) image URLs are supported (got ${url.protocol}).`)
    }

    if (url.username || url.password) throw new Error('Image URLs must not contain credentials.')

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    const isBlocked =
        BLOCKED_HOSTNAMES.has(hostname) ||
        hostname.endsWith('.localhost') ||
        isPrivateIpv4(hostname) ||
        isPrivateIpv6(hostname)

    if (isBlocked) {
        throw new Error(`Refusing to fetch a private or loopback address: ${url.hostname}`)
    }

    return url
}

/** `https://drive.google.com/uc?export=download&id=<id>` for a Drive file id. */
function driveDirectUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}`
}

/**
 * Rewrite common "share link" forms into the direct-file URL that actually
 * serves bytes. Unrecognized URLs are returned unchanged.
 */
export function normalizeRemoteImageUrl(rawUrl: string): string {
    let url: URL
    try {
        url = new URL(rawUrl)
    } catch {
        return rawUrl
    }

    const host = url.hostname.toLowerCase()

    if (host === 'drive.google.com') {
        const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/)
        if (pathMatch) return driveDirectUrl(pathMatch[1])

        const idParam = url.searchParams.get('id')
        if (idParam) return driveDirectUrl(idParam)
        return rawUrl
    }

    if (host === 'www.dropbox.com' || host === 'dropbox.com') {
        url.searchParams.delete('dl')
        url.searchParams.set('raw', '1')
        return url.toString()
    }

    return rawUrl
}

export interface RemoteImage {
    /** Raw base64 payload (no data: prefix). */
    base64: string
    contentType: string
    /** Name to store the asset under. */
    fileName: string
}

/** Extension for a content type, e.g. `image/jpeg` → `jpg`. */
function extensionFor(contentType: string): string {
    const subtype = contentType.split(';')[0].split('/')[1] ?? 'png'
    return subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/gi, '') || 'png'
}

/** Last path segment when it looks like a real file name, else null. */
function basenameFromUrl(url: URL): string | null {
    const last = url.pathname.split('/').filter(Boolean).pop()
    if (!last || !last.includes('.')) return null
    return decodeURIComponent(last)
}

/**
 * Fetch a remote image and return it as base64 plus a file name. Rejects
 * anything that is not a non-empty image within the size cap, so a caller never
 * re-hosts an error page or points a menu item at a broken asset.
 */
export async function fetchRemoteImageAsBase64(rawUrl: string, fileNameHint?: string): Promise<RemoteImage> {
    // Validate BEFORE normalizing and before any network call: the guard must
    // apply to the address the caller actually supplied.
    assertPublicHttpUrl(rawUrl)
    const normalized = normalizeRemoteImageUrl(rawUrl)
    let target = assertPublicHttpUrl(normalized)
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    const download = () => requestPublicImage(target, {
        assertUrl: assertPublicHttpUrl, maxBytes: MAX_REMOTE_IMAGE_BYTES, signal,
    })
    let response = await download()
    for (let redirects = 0; [301, 302, 303, 307, 308].includes(response.status); redirects++) {
        if (redirects >= 5) throw new Error('Too many image redirects.')
        const location = response.headers.get('location')
        if (!location) throw new Error('Image redirect has no location.')
        target = assertPublicHttpUrl(new URL(location, target).href)
        response = await download()
    }

    if (!response.ok) {
        throw new Error(`Could not download the image (HTTP ${response.status}).`)
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.startsWith('image/')) {
        throw new Error(
            `Remote file is not an image (content-type: ${contentType || 'unknown'}). ` +
                'Share links often need to be publicly viewable and point at the file itself.',
        )
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength === 0) {
        throw new Error('Remote image was empty.')
    }
    if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
        throw new Error(
            `Remote image is too large (${buffer.byteLength} bytes; max ${MAX_REMOTE_IMAGE_BYTES}).`,
        )
    }

    const fileName = fileNameHint ?? basenameFromUrl(target) ?? `image.${extensionFor(contentType)}`

    return { base64: buffer.toString('base64'), contentType, fileName }
}
