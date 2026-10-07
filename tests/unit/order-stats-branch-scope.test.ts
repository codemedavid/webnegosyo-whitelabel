/**
 * The dashboard's "today" figures on a platform store must follow the
 * account's branch scope like every other order read in orders-service: a
 * branch manager sees their branch's day, never the whole store's.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const filters: Array<[string, string, unknown]> = []
let userRole: Record<string, unknown> = {}

function chain() {
  const result = { data: [{ status: 'pending', total: 100 }], error: null }
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push(['eq', column, value]); return builder },
    gte: (column: string, value: unknown) => { filters.push(['gte', column, value]); return builder },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return builder
}

jest.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => chain() }) }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: async () => ({ userRole }) }))

async function readStats() {
  const { getOrderStats } = await import('@/lib/orders-service')
  return getOrderStats('tenant-1')
}

describe('getOrderStats branch scope', () => {
  beforeEach(() => { filters.length = 0 })

  test('a branch manager reads only their branch', async () => {
    // Arrange
    userRole = { role: 'admin', is_owner: false, tenant_id: 'tenant-1', outlet_id: 'outlet-7' }

    // Act
    const stats = await readStats()

    // Assert
    expect(filters).toContainEqual(['eq', 'outlet_id', 'outlet-7'])
    expect(stats.todayOrders).toBe(1)
  })

  test('the owner reads the whole store', async () => {
    // Arrange
    userRole = { role: 'admin', is_owner: true, tenant_id: 'tenant-1', outlet_id: null }

    // Act
    await readStats()

    // Assert
    expect(filters.some(([, column]) => column === 'outlet_id')).toBe(false)
    expect(filters).toContainEqual(['eq', 'tenant_id', 'tenant-1'])
  })
})
