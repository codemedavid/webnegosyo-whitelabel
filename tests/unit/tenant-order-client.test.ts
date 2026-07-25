import { describe, it, expect } from '@jest/globals'
import {
  createTenantOrderWriteClient,
  createTenantOrderRealtimeClient,
  type TenantOrderClientFactory,
  type TenantOrderCredentials,
} from '@/lib/supabase/tenant-order-client'

const TENANT_URL = 'https://tenantproj.supabase.co'
const ANON_KEY = 'tenant-anon-key'
const SERVICE_KEY = 'tenant-service-role-key'

function makeCredentials(
  overrides: Partial<TenantOrderCredentials> = {}
): TenantOrderCredentials {
  return {
    supabase_order_url: TENANT_URL,
    supabase_order_anon_key: ANON_KEY,
    supabase_order_service_key: SERVICE_KEY,
    ...overrides,
  }
}

/** Records every (url, key, options) triple the factory is called with. */
function makeSpyFactory() {
  const calls: Array<{ url: string; key: string; options?: unknown }> = []
  const factory: TenantOrderClientFactory = (url, key, options) => {
    calls.push({ url, key, options })
    return { __client: `${url}|${key}` } as never
  }
  return { factory, calls }
}

describe('createTenantOrderWriteClient', () => {
  it('builds the client from the tenant project URL and service-role key', () => {
    // Arrange
    const { factory, calls } = makeSpyFactory()

    // Act
    createTenantOrderWriteClient(makeCredentials(), factory)

    // Assert
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(TENANT_URL)
    expect(calls[0].key).toBe(SERVICE_KEY)
  })

  it('never uses the anon key for writes', () => {
    const { factory, calls } = makeSpyFactory()

    createTenantOrderWriteClient(makeCredentials(), factory)

    expect(calls[0].key).not.toBe(ANON_KEY)
  })

  it('disables session persistence so the server client stays stateless', () => {
    const { factory, calls } = makeSpyFactory()

    createTenantOrderWriteClient(makeCredentials(), factory)

    expect(calls[0].options).toMatchObject({
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it('throws a descriptive error when the project URL is missing', () => {
    const { factory } = makeSpyFactory()

    expect(() =>
      createTenantOrderWriteClient(makeCredentials({ supabase_order_url: null }), factory)
    ).toThrow(/supabase_order_url/i)
  })

  it('throws a descriptive error when the service-role key is missing', () => {
    const { factory } = makeSpyFactory()

    expect(() =>
      createTenantOrderWriteClient(
        makeCredentials({ supabase_order_service_key: '   ' }),
        factory
      )
    ).toThrow(/service-role/i)
  })

  it('does not construct a client when credentials are incomplete', () => {
    const { factory, calls } = makeSpyFactory()

    expect(() =>
      createTenantOrderWriteClient(makeCredentials({ supabase_order_url: '' }), factory)
    ).toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('createTenantOrderRealtimeClient', () => {
  it('builds the client from the tenant project URL and anon key', () => {
    const { factory, calls } = makeSpyFactory()

    createTenantOrderRealtimeClient(makeCredentials(), factory)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(TENANT_URL)
    expect(calls[0].key).toBe(ANON_KEY)
  })

  it('never leaks the service-role key to the realtime client', () => {
    const { factory, calls } = makeSpyFactory()

    createTenantOrderRealtimeClient(makeCredentials(), factory)

    expect(calls[0].key).not.toBe(SERVICE_KEY)
    expect(JSON.stringify(calls[0])).not.toContain(SERVICE_KEY)
  })

  it('throws a descriptive error when the anon key is missing', () => {
    const { factory } = makeSpyFactory()

    expect(() =>
      createTenantOrderRealtimeClient(
        makeCredentials({ supabase_order_anon_key: null }),
        factory
      )
    ).toThrow(/anon/i)
  })

  it('does not require the service-role key to subscribe', () => {
    const { factory, calls } = makeSpyFactory()

    createTenantOrderRealtimeClient(
      makeCredentials({ supabase_order_service_key: null }),
      factory
    )

    expect(calls).toHaveLength(1)
  })
})

describe('default client factory', () => {
  it('builds a real client when no factory is injected', () => {
    // Arrange / Act: no factory argument at all — exercises the real
    // @supabase/supabase-js path to prove the module ships a working default
    // rather than only functioning under dependency injection.
    const writeClient = createTenantOrderWriteClient(makeCredentials())
    const realtimeClient = createTenantOrderRealtimeClient(makeCredentials())

    // Assert: real clients expose the query and channel surfaces callers rely on.
    expect(typeof writeClient.from).toBe('function')
    expect(typeof realtimeClient.channel).toBe('function')
  })
})
