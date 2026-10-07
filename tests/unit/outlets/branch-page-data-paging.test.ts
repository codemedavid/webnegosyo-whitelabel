/**
 * loadBranchMetrics must read past PostgREST's 1000-row cap: a single bare
 * read stopped at the newest 1000 orders, so a busy store's branch takings
 * silently covered only its last few days.
 */

jest.mock('server-only', () => ({}), { virtual: true })

const ranges: Array<[number, number]> = []

function makeRows(count: number) {
  return Array.from({ length: count }, () => ({ outlet_id: 'b1', total: 10, status: 'delivered', customer_data: null }))
}

function makeBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      ranges.push([from, to])
      const data = from === 0 ? makeRows(1000) : from === 1000 ? makeRows(5) : []
      return Promise.resolve({ data, error: null })
    },
  }
  return builder
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => makeBuilder() }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: async () => ({ userRole: { role: 'admin', tenant_id: 't1', outlet_id: null } }),
}))

test('counts every order past the first 1000-row page', async () => {
  // Arrange
  const { loadBranchMetrics } = await import('@/lib/outlets/branch-page-data')
  const tenant = { id: 't1', order_backend: 'platform', convex_deployment_url: null } as never

  // Act
  const rows = await loadBranchMetrics(tenant)

  // Assert
  expect(ranges[0]).toEqual([0, 999])
  expect(ranges.some(([from]) => from === 1000)).toBe(true)
  const total = (rows ?? []).reduce((sum, row) => sum + row.orderCount, 0)
  expect(total).toBe(1005)
})
