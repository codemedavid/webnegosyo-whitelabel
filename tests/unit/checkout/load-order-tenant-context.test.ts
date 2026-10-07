/**
 * `createOrderAction` opened with three sequential reads — the tenant row, its
 * secrets, then the order type — none of which needs another's answer. They
 * now leave together, but the action must still hear them in the old order:
 * an inactive store is refused before a secrets failure can turn it into a
 * "lost order", and an order-type failure is reported where it always was.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

interface Pending {
  table: string
  resolve: (value: { data: unknown; error: unknown }) => void
}

let pending: Pending[] = []
let secretsImpl: () => Promise<unknown> = async () => null

function deferredClient() {
  return {
    from: (table: string) => {
      const promise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
        pending.push({ table, resolve })
      })
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: () => promise,
        maybeSingle: () => promise,
      }
      return chain
    },
  }
}

jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: () => secretsImpl(),
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function load(orderTypeId?: string) {
  const { loadOrderTenantContext } = await import('@/lib/checkout/load-order-tenant-context')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return loadOrderTenantContext(deferredClient() as any, 'tenant-1', orderTypeId)
}

function settle(table: string, value: { data: unknown; error: unknown }) {
  pending.find((read) => read.table === table)!.resolve(value)
}

describe('loadOrderTenantContext', () => {
  beforeEach(() => {
    pending = []
    secretsImpl = async () => ({ convex_deploy_key: 'key' })
  })

  test('issues the tenant and order-type reads and the secrets read together', async () => {
    // Arrange
    const secrets = jest.fn(async () => null)
    secretsImpl = secrets

    // Act
    const context = load('ot-1')
    await flush()

    // Assert — nothing has answered yet, every read is already in flight.
    expect(pending.map((read) => read.table).sort()).toEqual(['order_types', 'tenants'])
    expect(secrets).toHaveBeenCalledTimes(1)

    settle('tenants', { data: { id: 'tenant-1', is_active: true }, error: null })
    settle('order_types', { data: { name: 'Pickup', type: 'pickup' }, error: null })
    const result = await context
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await expect(result.orderType).resolves.toEqual({ ok: true, row: { name: 'Pickup', type: 'pickup' } })
  })

  test('skips the order-type read when no type was chosen', async () => {
    // Act
    const context = load(undefined)
    await flush()
    settle('tenants', { data: { id: 'tenant-1' }, error: null })
    const result = await context

    // Assert
    expect(pending.map((read) => read.table)).toEqual(['tenants'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await expect(result.orderType).resolves.toEqual({ ok: true, row: null })
  })

  test('an inactive store is refused even when the secrets read failed', async () => {
    // Arrange
    secretsImpl = async () => { throw new Error('secrets down') }

    // Act
    const context = load('ot-1')
    await flush()
    settle('tenants', { data: null, error: { code: 'PGRST116' } })
    settle('order_types', { data: null, error: null })

    // Assert
    await expect(context).resolves.toEqual({ ok: false })
  })

  test('a secrets failure for an active store still throws (an order that cannot be routed is lost)', async () => {
    // Arrange
    secretsImpl = async () => { throw new Error('secrets down') }

    // Act
    const context = load(undefined)
    await flush()
    settle('tenants', { data: { id: 'tenant-1' }, error: null })

    // Assert
    await expect(context).rejects.toThrow('secrets down')
  })

  test('merges the Convex deploy key onto the tenant config', async () => {
    // Act
    const context = load(undefined)
    await flush()
    settle('tenants', { data: { id: 'tenant-1', order_backend: 'convex' }, error: null })
    const result = await context

    // Assert
    expect(result.ok && result.tenantConfig).toEqual({ id: 'tenant-1', order_backend: 'convex', convex_deploy_key: 'key' })
    expect(result.ok && result.tenantSecrets).toEqual({ convex_deploy_key: 'key' })
  })

  test('an order-type read error is reported, not thrown', async () => {
    // Act
    const context = load('ot-1')
    await flush()
    settle('tenants', { data: { id: 'tenant-1' }, error: null })
    settle('order_types', { data: null, error: { message: 'down' } })
    const result = await context

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await expect(result.orderType).resolves.toEqual({ ok: false })
  })
})
