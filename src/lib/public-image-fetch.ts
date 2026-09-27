import 'server-only'
import { lookup } from 'node:dns'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupFunction } from 'node:net'

interface PublicImageRequestOptions {
  assertUrl: (url: string) => URL
  maxBytes: number
  signal: AbortSignal
}

/**
 * Resolve and validate inside the socket's lookup, so the connection uses the
 * checked address. A preflight DNS check followed by fetch would resolve again
 * and allow DNS rebinding. No agent means an unchecked pooled socket cannot win.
 * Redirects are returned to the caller for URL validation on every hop.
 */
export function requestPublicImage(url: URL, { assertUrl, maxBytes, signal }: PublicImageRequestOptions): Promise<Response> {
  assertUrl(url.href)
  const publicLookup: LookupFunction = (hostname, options, callback) => {
    lookup(hostname, { all: true, family: options.family }, (error, addresses) => {
      if (error) return callback(error, '')
      try {
        if (!addresses.length) throw new Error('Image host has no addresses.')
        for (const { address, family } of addresses) {
          assertUrl(`http://${family === 6 ? `[${address}]` : address}/`)
        }
        // Node can request all addresses when autoSelectFamily is enabled.
        if (options.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      } catch (error) {
        callback(error instanceof Error ? error : new Error('Invalid image host.'), '')
      }
    })
  }

  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      lookup: publicLookup,
      agent: false,
      signal,
      headers: { 'Accept-Encoding': 'identity' },
    }, (incoming) => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const status = incoming.statusCode ?? 502
      if (status < 200 || status >= 300) {
        incoming.destroy()
        resolve(new Response(null, { status, headers }))
        return
      }
      if (Number(headers.get('content-length')) > maxBytes) {
        incoming.destroy()
        reject(new Error(`Remote image is too large (max ${maxBytes} bytes).`))
        return
      }
      void (async () => {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of incoming) {
          const bytes = Buffer.from(chunk)
          size += bytes.length
          if (size > maxBytes) throw new Error(`Remote image is too large (max ${maxBytes} bytes).`)
          chunks.push(bytes)
        }
        resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status, headers }))
      })().catch(reject)
    })
    request.on('error', reject)
    request.end()
  })
}
