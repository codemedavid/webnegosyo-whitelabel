/**
 * TXT lookup over DNS-over-HTTPS (Cloudflare's JSON API).
 *
 * Plain `fetch` rather than `node:dns`: it runs on any runtime, is trivially
 * injectable in tests, and reads a public resolver instead of whatever the
 * host resolver last cached — an owner who just added the record should see
 * it pass on the next check.
 */

export type TxtLookupResult = { ok: true; values: string[] } | { ok: false }
export type TxtLookup = (name: string) => Promise<TxtLookupResult>

type FetchLike = (input: string, init: RequestInit & { headers: Record<string, string> }) => Promise<Response>

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'
const LOOKUP_TIMEOUT_MS = 5_000
const TXT_RECORD_TYPE = 16
const DNS_NOERROR = 0
const DNS_NXDOMAIN = 3

/** `"part-one" "part-two"` → `part-onepart-two` (RFC 7208 §3.3 concatenation). */
function unquoteTxt(data: string): string {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g)
  if (!parts) return data
  return parts.map((part) => part.slice(1, -1).replace(/\\(.)/g, '$1')).join('')
}

export function createDohTxtLookup(fetchImpl: FetchLike = fetch as FetchLike): TxtLookup {
  return async (name) => {
    try {
      const params = new URLSearchParams({ name, type: 'TXT' })
      const response = await fetchImpl(`${DOH_ENDPOINT}?${params.toString()}`, {
        headers: { Accept: 'application/dns-json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      })
      if (!response.ok) return { ok: false }

      const body = (await response.json()) as { Status?: number; Answer?: Array<{ type?: number; data?: string }> }
      if (body.Status === DNS_NXDOMAIN) return { ok: true, values: [] }
      if (body.Status !== DNS_NOERROR) return { ok: false }

      const values = (body.Answer ?? [])
        .filter((answer) => answer.type === TXT_RECORD_TYPE && typeof answer.data === 'string')
        .map((answer) => unquoteTxt(answer.data as string))
      return { ok: true, values }
    } catch {
      return { ok: false }
    }
  }
}
