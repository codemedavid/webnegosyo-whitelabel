/**
 * @jest-environment node
 */
import {
  interpretPlatformStockProbe,
  platformStockProbeRequest,
  probePlatformStockContract,
} from '@/lib/inventory/platform-stock-contract'

const REST = 'https://example.supabase.co/rest/v1'

describe('platform stock probe requests', () => {
  it('uses a cheap table GET instead of the OpenAPI root', () => {
    expect(platformStockProbeRequest(REST, '/simple_option_stock_applications')).toEqual({
      url: `${REST}/simple_option_stock_applications?limit=0`,
      method: 'GET',
    })
  })

  /**
   * PostgREST resolves an RPC by name AND argument signature. A GET carrying no
   * arguments matches no overload, so it answers 404/PGRST202 — the same answer
   * it gives for a function that does not exist at all. Probing without
   * arguments therefore cannot tell present from missing, and it reported the
   * live `apply_simple_option_order_stock` as absent, failing the production
   * build of a database that had it. The argument names must go on the URL.
   */
  it('probes the mutating RPC with its argument names, or it cannot be found', () => {
    const { url, method } = platformStockProbeRequest(
      REST,
      '/rpc/apply_simple_option_order_stock',
    )

    expect(method).toBe('GET')
    expect(url.startsWith(`${REST}/rpc/apply_simple_option_order_stock?`)).toBe(true)
    for (const argument of [
      'p_tenant_id',
      'p_order_id',
      'p_action',
      'p_revision',
      'p_items',
      'p_outlet_id',
    ]) {
      expect(url).toContain(argument)
    }
  })
})

describe('interpretPlatformStockProbe', () => {
  it('treats table 200 as present and 404 as missing', () => {
    expect(interpretPlatformStockProbe('/simple_option_stock_applications', 200)).toBe('present')
    expect(interpretPlatformStockProbe('/simple_option_stock_movements', 404)).toBe('missing')
  })

  it('treats RPC GET 405/400 as present without requiring a POST', () => {
    expect(interpretPlatformStockProbe('/rpc/apply_simple_option_order_stock', 405)).toBe('present')
    expect(interpretPlatformStockProbe('/rpc/apply_simple_option_order_stock', 400)).toBe('present')
    expect(interpretPlatformStockProbe('/rpc/apply_simple_option_order_stock', 404)).toBe('missing')
  })

  it('fails closed if GET would have executed the mutating RPC', () => {
    expect(interpretPlatformStockProbe('/rpc/apply_simple_option_order_stock', 200)).toBe('unavailable')
    expect(interpretPlatformStockProbe('/rpc/apply_simple_option_order_stock', 204)).toBe('unavailable')
  })

  it('treats gateway timeouts as unavailable rather than missing schema', () => {
    expect(interpretPlatformStockProbe('/simple_option_stock_applications', 504)).toBe('unavailable')
    expect(interpretPlatformStockProbe('/rpc/apply_simple_option_order_stock', 502)).toBe('unavailable')
  })
})

describe('probePlatformStockContract', () => {
  function jsonResponse(status: number): Response {
    return new Response('{}', { status, headers: { 'content-type': 'application/json' } })
  }

  it('confirms every contract path with GET probes and never fetches OpenAPI', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'GET') throw new Error(`expected GET, got ${init?.method}`)
      const url = String(input)
      if (url.includes('/rpc/')) return jsonResponse(405)
      return jsonResponse(200)
    })

    await expect(probePlatformStockContract({
      restUrl: REST,
      apiKey: 'service-role',
      fetchImpl,
      retries: 0,
    })).resolves.toEqual([])

    const urls = fetchImpl.mock.calls.map(([input]) => String(input))
    expect(urls).toEqual([
      `${REST}/simple_option_stock_applications?limit=0`,
      `${REST}/simple_option_stock_movements?limit=0`,
      platformStockProbeRequest(REST, '/rpc/apply_simple_option_order_stock').url,
    ])
    expect(urls.some((url) => url === `${REST}/` || url === REST)).toBe(false)
  })

  it('reports missing ledger tables and RPC', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(404))

    await expect(probePlatformStockContract({
      restUrl: REST,
      apiKey: 'service-role',
      fetchImpl,
      retries: 0,
    })).resolves.toEqual([
      '/simple_option_stock_applications',
      '/simple_option_stock_movements',
      '/rpc/apply_simple_option_order_stock',
    ])
  })

  it('retries a 504 probe and succeeds when PostgREST recovers', async () => {
    let attempts = 0
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('simple_option_stock_applications')) {
        attempts += 1
        if (attempts === 1) return jsonResponse(504)
      }
      if (url.includes('/rpc/')) return jsonResponse(405)
      return jsonResponse(200)
    })

    await expect(probePlatformStockContract({
      restUrl: REST,
      apiKey: 'service-role',
      fetchImpl,
      retries: 1,
      retryDelayMs: 0,
    })).resolves.toEqual([])
    expect(attempts).toBe(2)
  })

  it('does not retry auth failures', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(401))

    await expect(probePlatformStockContract({
      restUrl: REST,
      apiKey: 'service-role',
      fetchImpl,
      retries: 2,
      retryDelayMs: 0,
    })).rejects.toThrow('Platform stock contract check failed for /simple_option_stock_applications with HTTP 401.')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a probe keeps returning 504', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(504))

    await expect(probePlatformStockContract({
      restUrl: REST,
      apiKey: 'service-role',
      fetchImpl,
      retries: 1,
      retryDelayMs: 0,
    })).rejects.toThrow('Platform stock contract check failed for /simple_option_stock_applications with HTTP 504.')
  })
})
