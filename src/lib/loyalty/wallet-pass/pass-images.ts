/**
 * The store logo as Apple Wallet wants it: `logo.png` (≤160×50pt) and the
 * square `icon.png` used in lock-screen notifications, at 1×/2×/3×.
 *
 * The logo URL is merchant-controlled, so it is fetched like any untrusted
 * URL: public addresses only (checked at connect time), no redirects, bounded
 * time and size. A logo that
 * cannot be read falls back to the platform logo — a pass without an icon is
 * rejected by Wallet, so the fallback is not optional.
 */

import 'server-only'
import sharp from 'sharp'
import { get as httpsGet } from 'node:https'
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { assertPublicHttpUrl } from '@/lib/imagekit-remote'

const FETCH_TIMEOUT_MS = 5000
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 50

export type PassImageFiles = Record<string, Buffer>

const cache = new Map<string, { files: PassImageFiles; expiresAt: number }>()

/** Rejects any address that is private, loopback, link-local or metadata. */
function assertPublicAddress(address: string, family: number): void {
  assertPublicHttpUrl(family === 6 ? `https://[${address}]/` : `https://${address}/`)
}

type LookupCallback = (error: Error | null, address: string | LookupAddress[], family?: number) => void

/**
 * DNS lookup that validates the address the socket will ACTUALLY connect to.
 * Checking only the hostname string leaves a rebinding gap: a short-TTL name
 * can pass the check and then resolve to 169.254.169.254 for the connection.
 */
export function publicOnlyLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '')
    try {
      addresses.forEach((entry) => assertPublicAddress(entry.address, entry.family))
    } catch (refusal) {
      return callback(refusal as Error, '')
    }
    if (options.all) return callback(null, addresses)
    const [first] = addresses
    return first ? callback(null, first.address, first.family) : callback(new Error('no address'), '')
  })
}

function fetchImage(url: string): Promise<Buffer> {
  const target = assertPublicHttpUrl(url)
  if (target.protocol !== 'https:') return Promise.reject(new Error('logo must be https'))

  return new Promise((resolve, reject) => {
    const request = httpsGet(target, { lookup: publicOnlyLookup as never, timeout: FETCH_TIMEOUT_MS }, (response) => {
      const status = response.statusCode ?? 0
      // No redirects: a redirect is how a public URL would hand us a private one.
      if (status !== 200) {
        response.resume()
        return reject(new Error(`logo fetch returned ${status}`))
      }
      if (!(response.headers['content-type'] ?? '').startsWith('image/')) {
        response.resume()
        return reject(new Error('logo is not an image'))
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_IMAGE_BYTES) {
          request.destroy(new Error('logo too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('logo fetch timed out')))
    request.on('error', reject)
  })
}

async function renderFiles(source: Buffer): Promise<PassImageFiles> {
  const files: PassImageFiles = {}
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`
    files[`logo${suffix}.png`] = await sharp(source)
      .resize({ width: 160 * scale, height: 50 * scale, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    files[`icon${suffix}.png`] = await sharp(source)
      .resize({ width: 29 * scale, height: 29 * scale, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toBuffer()
  }
  return files
}

function remember(key: string, files: PassImageFiles): PassImageFiles {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(key, { files, expiresAt: Date.now() + CACHE_TTL_MS })
  return files
}

export async function loadPassImages(logoUrl: string | null, fallbackLogoUrl: string): Promise<PassImageFiles> {
  for (const url of [logoUrl, fallbackLogoUrl]) {
    if (!url) continue
    const cached = cache.get(url)
    if (cached && cached.expiresAt > Date.now()) {
      // Re-insert so eviction drops the least recently USED logo, not the oldest.
      cache.delete(url)
      cache.set(url, cached)
      return cached.files
    }
    try {
      return remember(url, await renderFiles(await fetchImage(url)))
    } catch (error) {
      console.error('[wallet-pass] logo unavailable, trying fallback:', error instanceof Error ? error.message : error)
    }
  }
  throw new Error('no usable logo for the wallet pass')
}
