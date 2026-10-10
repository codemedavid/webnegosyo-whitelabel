/**
 * The pipeline page is a superadmin request path on the one shared database:
 * its service-role client must be bounded by the timed fetch, or a slow read
 * hangs the function instead of failing fast.
 */
jest.mock('server-only', () => ({}))

const createAdminClient = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 8000,
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

function emptyQuery() {
  const result = { data: [], error: null }
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'gte', 'order', 'in', 'eq', 'neq', 'limit']) chain[method] = () => chain
  chain.range = () => Promise.resolve(result)
  return chain
}

describe('loadPipelineData', () => {
  it('creates the admin client with a query timeout', async () => {
    createAdminClient.mockReturnValue({ from: () => emptyQuery() })
    const { loadPipelineData } = await import('@/lib/sales-pipeline/pipeline-server')

    await loadPipelineData({ range: 'all', offer: 'all' } as never, 0)

    expect(createAdminClient).toHaveBeenCalledWith({ timeoutMs: 8000 })
  })
})
