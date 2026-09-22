export const PLATFORM_STOCK_CONTRACT_PATHS = [
  '/simple_option_stock_applications',
  '/simple_option_stock_movements',
  '/rpc/apply_simple_option_order_stock',
] as const

export type PlatformStockContractPath = typeof PLATFORM_STOCK_CONTRACT_PATHS[number]
export type PlatformStockProbeVerdict = 'present' | 'missing' | 'unavailable'

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 500

/**
 * The arguments `simple-option-stock-service.ts` actually calls the RPC with.
 *
 * PostgREST resolves a function by name AND argument names, so these are what
 * make the probe find it — and they make the guard check the signature the
 * caller depends on, not merely that something of that name exists.
 */
const STOCK_RPC_ARGUMENTS = [
  'p_tenant_id',
  'p_order_id',
  'p_action',
  'p_revision',
  'p_items',
  'p_outlet_id',
] as const

/** Table GET with limit=0 (no assumed PK column), or GET on the VOLATILE RPC. */
export function platformStockProbeRequest(
  restUrl: string,
  path: PlatformStockContractPath,
): { url: string; method: 'GET' } {
  const base = restUrl.replace(/\/$/, '')
  if (path.startsWith('/rpc/')) {
    // Empty values on purpose: the function is VOLATILE, so PostgREST refuses
    // GET (405), and uuid coercion of "" fails first anyway (400). Both prove
    // it is there; neither runs it.
    const args = STOCK_RPC_ARGUMENTS.map((name) => `${name}=`).join('&')
    return { url: `${base}${path}?${args}`, method: 'GET' }
  }
  return { url: `${base}${path}?limit=0`, method: 'GET' }
}

export function interpretPlatformStockProbe(
  path: string,
  status: number,
): PlatformStockProbeVerdict {
  if (status === 404) return 'missing'
  if (status >= 500 || status === 401 || status === 403) return 'unavailable'
  if (path.startsWith('/rpc/')) {
    // GET 405 = VOLATILE RPC exists. GET 400 = exists but required args omitted.
    // GET 200/204 would mean PostgREST ran it — fail closed instead of treating that as presence.
    if (status === 405 || status === 400) return 'present'
    return 'unavailable'
  }
  if (status === 200 || status === 204 || status === 206) return 'present'
  return 'unavailable'
}

type PlatformStockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface ProbePlatformStockContractOptions {
  restUrl: string
  apiKey: string
  fetchImpl?: PlatformStockFetch
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

export async function probePlatformStockContract(
  options: ProbePlatformStockContractOptions,
): Promise<string[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const headers = {
    apikey: options.apiKey,
    authorization: `Bearer ${options.apiKey}`,
    accept: 'application/json',
    prefer: 'count=none',
  }

  const missing: string[] = []
  for (const path of PLATFORM_STOCK_CONTRACT_PATHS) {
    const { url, method } = platformStockProbeRequest(options.restUrl, path)
    const { status, verdict } = await probeOnce({
      url,
      method,
      headers,
      path,
      fetchImpl,
      timeoutMs,
      retries,
      retryDelayMs,
    })
    if (verdict === 'unavailable') {
      throw new Error(`Platform stock contract check failed for ${path} with HTTP ${status}.`)
    }
    if (verdict === 'missing') missing.push(path)
  }
  return missing
}

async function probeOnce(args: {
  url: string
  method: 'GET'
  headers: Record<string, string>
  path: string
  fetchImpl: PlatformStockFetch
  timeoutMs: number
  retries: number
  retryDelayMs: number
}): Promise<{ status: number; verdict: PlatformStockProbeVerdict }> {
  for (let attempt = 0; attempt <= args.retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), args.timeoutMs)
    try {
      const response = await args.fetchImpl(args.url, {
        method: args.method,
        headers: args.headers,
        signal: controller.signal,
      })
      const verdict = interpretPlatformStockProbe(args.path, response.status)
      const retryable = verdict === 'unavailable' && response.status >= 500
      if (!retryable || attempt === args.retries) {
        return { status: response.status, verdict }
      }
    } catch (error) {
      if (attempt === args.retries) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Platform stock contract check failed for ${args.path}: ${reason}`)
      }
    } finally {
      clearTimeout(timer)
    }
    if (args.retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, args.retryDelayMs))
    }
  }
  throw new Error(`Platform stock contract check failed for ${args.path}.`)
}
