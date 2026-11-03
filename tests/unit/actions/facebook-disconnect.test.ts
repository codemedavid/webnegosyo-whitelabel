/** @jest-environment node */

/**
 * Settings → Messenger → Disconnect is what the privacy policy and the
 * /data-deletion page tell a merchant to press. It must do what those pages
 * promise: stop Meta sending the Page's messages to us (unsubscribe our app
 * from the Page) and forget every token we hold for the store — the page
 * token, the owner's user token, and any half-finished connection that still
 * holds one. A Page whose token Facebook already revoked (the owner removed
 * the app in Business Integrations) must still be disconnectable.
 */

jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn().mockResolvedValue({ user: { id: 'owner-1' } }),
  verifyTenantPermission: jest.fn().mockResolvedValue({ user: { id: 'owner-1' } }),
}))

const getTenantPageByPageId = jest.fn()
jest.mock('@/lib/facebook/page-tokens', () => ({
  getTenantPageByPageId: (...args: unknown[]) => getTenantPageByPageId(...args),
  getTenantActivePageById: jest.fn(),
}))

const unsubscribePageFromWebhook = jest.fn()
jest.mock('@/lib/facebook-api', () => ({
  unsubscribePageFromWebhook: (...args: unknown[]) => unsubscribePageFromWebhook(...args),
}))

interface RecordedQuery {
  table: string
  operation: string
  filters: Array<[string, string, unknown]>
}

let queries: RecordedQuery[] = []

/** A PostgREST builder stand-in that records each delete/update and its filters. */
function builderFor(table: string) {
  const query: RecordedQuery = { table, operation: 'select', filters: [] }
  const result = table === 'tenants'
    ? { data: { facebook_page_id: 'row-1' }, error: null }
    : { data: null, error: null }
  const builder = {
    select: () => builder,
    delete: () => {
      query.operation = 'delete'
      queries = [...queries, query]
      return builder
    },
    update: (values: unknown) => {
      query.operation = `update ${JSON.stringify(values)}`
      queries = [...queries, query]
      return builder
    },
    eq: (column: string, value: unknown) => {
      query.filters.push(['eq', column, value])
      return builder
    },
    like: (column: string, value: unknown) => {
      query.filters.push(['like', column, value])
      return builder
    },
    single: async () => result,
    then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
  }
  return builder
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => builderFor(table) }),
}))

async function load() {
  return import('@/actions/facebook')
}

describe('disconnectFacebookPageAction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries = []
    getTenantPageByPageId.mockResolvedValue({ id: 'row-1', page_access_token: 'page-token' })
    unsubscribePageFromWebhook.mockResolvedValue(true)
  })

  it('unsubscribes our app from the Page with its own token before forgetting it', async () => {
    // Arrange
    const { disconnectFacebookPageAction } = await load()

    // Act
    const result = await disconnectFacebookPageAction('store-1', 'page-1')

    // Assert
    expect(result).toEqual({ success: true })
    expect(unsubscribePageFromWebhook).toHaveBeenCalledWith('page-1', 'page-token')
    const pageDelete = queries.find(
      (q) => q.table === 'facebook_pages' && q.operation === 'delete' && q.filters.some(([, col, v]) => col === 'page_id' && v === 'page-1'),
    )
    expect(pageDelete?.filters).toEqual(expect.arrayContaining([['eq', 'tenant_id', 'store-1']]))
  })

  it('deletes half-finished connections that still hold the owner user token', async () => {
    // Arrange
    const { disconnectFacebookPageAction } = await load()

    // Act
    await disconnectFacebookPageAction('store-1', 'page-1')

    // Assert
    const tempDelete = queries.find(
      (q) => q.table === 'facebook_pages' && q.operation === 'delete' && q.filters.some(([op]) => op === 'like'),
    )
    expect(tempDelete?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'tenant_id', 'store-1'],
        ['eq', 'is_active', false],
        ['like', 'page_id', 'temp_%'],
      ]),
    )
  })

  it('still forgets the tokens when Facebook refuses the unsubscribe (token already revoked)', async () => {
    // Arrange
    unsubscribePageFromWebhook.mockRejectedValue(new Error('Error validating access token'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { disconnectFacebookPageAction } = await load()

    // Act
    const result = await disconnectFacebookPageAction('store-1', 'page-1')

    // Assert
    expect(result).toEqual({ success: true })
    expect(queries.some((q) => q.table === 'facebook_pages' && q.operation === 'delete')).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('refuses a Page the store does not own without calling Facebook', async () => {
    // Arrange
    getTenantPageByPageId.mockResolvedValue(null)
    const { disconnectFacebookPageAction } = await load()

    // Act
    const result = await disconnectFacebookPageAction('store-1', 'someone-elses-page')

    // Assert
    expect(result).toEqual({ success: false, error: 'Page connection not found' })
    expect(unsubscribePageFromWebhook).not.toHaveBeenCalled()
    expect(queries).toEqual([])
  })
})
