/** @jest-environment node */

/**
 * POST /api/auth/facebook/connect used to store whatever page id, page name
 * and access tokens the browser sent. A settings-staffer could therefore bind
 * any page id (another store's page) to their store with a forged token. The
 * route now reads the user token from the OAuth temp row server-side, lists
 * that user's pages from Facebook and takes the page token + name from the
 * page matching the requested id; body tokens are ignored.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getTenantUserAccessToken: jest.fn() }))
jest.mock('@/lib/facebook-api', () => ({
  getUserPages: jest.fn(),
  subscribePageToWebhook: jest.fn().mockResolvedValue({ success: true }),
}))

interface Recorded { table: string; op: string; payload?: unknown }

function mockSession({
  existingPage = null as { id: string } | null,
  writeError = null as { code?: string; message: string } | null,
} = {}) {
  const recorded: Recorded[] = []
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    let op = 'select'
    const chain = () => builder
    Object.assign(builder, {
      select: jest.fn(chain),
      eq: jest.fn(chain),
      insert: jest.fn((payload: unknown) => { op = 'insert'; recorded.push({ table, op, payload }); return builder }),
      update: jest.fn((payload: unknown) => { op = 'update'; recorded.push({ table, op, payload }); return builder }),
      delete: jest.fn(() => { op = 'delete'; recorded.push({ table, op }); return builder }),
      maybeSingle: jest.fn(async () => {
        if (table === 'app_users') return { data: { role: 'admin', tenant_id: 'store-1', is_owner: true, permissions: [] } }
        if (table === 'facebook_pages') return { data: existingPage }
        return { data: null }
      }),
      single: jest.fn(async () => {
        if (table === 'facebook_pages' && op === 'insert') {
          return writeError ? { data: null, error: writeError } : { data: { id: 'row-new' }, error: null }
        }
        if (table === 'tenants') return { data: { facebook_page_id: 'already-set' } }
        return { data: null }
      }),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: op === 'update' && table === 'facebook_pages' ? writeError : null }),
    })
    return builder
  }
  return { recorded, client: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } } }) }, from } }
}

function connectRequest(body: Record<string, unknown>) {
  return new NextRequest('https://example.test/api/auth/facebook/connect', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

async function load() {
  const { createClient } = await import('@/lib/supabase/server')
  const { getTenantUserAccessToken } = await import('@/lib/facebook/page-tokens')
  const { getUserPages, subscribePageToWebhook } = await import('@/lib/facebook-api')
  const { POST } = await import('@/app/api/auth/facebook/connect/route')
  return {
    POST,
    createClient: jest.mocked(createClient),
    getTenantUserAccessToken: jest.mocked(getTenantUserAccessToken),
    getUserPages: jest.mocked(getUserPages),
    subscribePageToWebhook: jest.mocked(subscribePageToWebhook),
  }
}

const FORGED = {
  tenant_id: 'store-1',
  page_id: 'page-1',
  temp_id: 'temp-1',
  page_name: 'Forged name',
  page_access_token: 'forged-page-token',
  user_access_token: 'forged-user-token',
}

describe('POST /api/auth/facebook/connect', () => {
  beforeEach(() => jest.clearAllMocks())

  it('stores the page token and name Facebook returns for the temp row user, never the body tokens', async () => {
    // Arrange
    const m = await load()
    const session = mockSession()
    m.createClient.mockResolvedValue(session.client as never)
    m.getTenantUserAccessToken.mockResolvedValue('server-user-token')
    m.getUserPages.mockResolvedValue([
      { id: 'page-0', name: 'Other', access_token: 'other-token' },
      { id: 'page-1', name: 'Real page', access_token: 'real-page-token' },
    ] as never)

    // Act
    const response = await m.POST(connectRequest(FORGED))

    // Assert
    expect(response.status).toBe(200)
    expect(m.getTenantUserAccessToken).toHaveBeenCalledWith('store-1', 'temp-1')
    expect(m.getUserPages).toHaveBeenCalledWith('server-user-token')
    const insert = session.recorded.find((r) => r.table === 'facebook_pages' && r.op === 'insert')
    expect(insert?.payload).toMatchObject({
      tenant_id: 'store-1',
      page_id: 'page-1',
      page_name: 'Real page',
      page_access_token: 'real-page-token',
      user_access_token: 'server-user-token',
    })
    expect(m.subscribePageToWebhook).toHaveBeenCalledWith('page-1', 'real-page-token')
  })

  it('works without any tokens in the body', async () => {
    // Arrange
    const m = await load()
    m.createClient.mockResolvedValue(mockSession().client as never)
    m.getTenantUserAccessToken.mockResolvedValue('server-user-token')
    m.getUserPages.mockResolvedValue([{ id: 'page-1', name: 'Real page', access_token: 'real-page-token' }] as never)

    // Act
    const response = await m.POST(connectRequest({ tenant_id: 'store-1', page_id: 'page-1', temp_id: 'temp-1' }))

    // Assert
    expect(response.status).toBe(200)
  })

  it('refuses a page id the Facebook user does not manage', async () => {
    // Arrange
    const m = await load()
    const session = mockSession()
    m.createClient.mockResolvedValue(session.client as never)
    m.getTenantUserAccessToken.mockResolvedValue('server-user-token')
    m.getUserPages.mockResolvedValue([{ id: 'page-9', name: 'Mine', access_token: 't' }] as never)

    // Act
    const response = await m.POST(connectRequest(FORGED))

    // Assert
    expect(response.status).toBe(403)
    expect(session.recorded.filter((r) => r.op !== 'select')).toEqual([])
    expect(m.subscribePageToWebhook).not.toHaveBeenCalled()
  })

  it('refuses when the temp row is missing or belongs to another store', async () => {
    // Arrange
    const m = await load()
    m.createClient.mockResolvedValue(mockSession().client as never)
    m.getTenantUserAccessToken.mockResolvedValue(null)

    // Act
    const response = await m.POST(connectRequest(FORGED))

    // Assert
    expect(response.status).toBe(404)
    expect(m.getUserPages).not.toHaveBeenCalled()
  })

  it('answers 409 with a friendly message when the page is already connected to another store', async () => {
    // Arrange
    const m = await load()
    m.createClient.mockResolvedValue(
      mockSession({ writeError: { code: '23505', message: 'duplicate key value violates unique constraint' } }).client as never,
    )
    m.getTenantUserAccessToken.mockResolvedValue('server-user-token')
    m.getUserPages.mockResolvedValue([{ id: 'page-1', name: 'Real page', access_token: 'real-page-token' }] as never)

    // Act
    const response = await m.POST(connectRequest(FORGED))

    // Assert
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/already connected to another store/i)
    expect(m.subscribePageToWebhook).not.toHaveBeenCalled()
  })

  it('also maps a unique violation when re-activating an existing row', async () => {
    // Arrange
    const m = await load()
    m.createClient.mockResolvedValue(
      mockSession({ existingPage: { id: 'row-1' }, writeError: { code: '23505', message: 'dup' } }).client as never,
    )
    m.getTenantUserAccessToken.mockResolvedValue('server-user-token')
    m.getUserPages.mockResolvedValue([{ id: 'page-1', name: 'Real page', access_token: 'real-page-token' }] as never)

    // Act
    const response = await m.POST(connectRequest(FORGED))

    // Assert
    expect(response.status).toBe(409)
  })

  it('answers 400 without tenant, page or temp id', async () => {
    const m = await load()
    m.createClient.mockResolvedValue(mockSession().client as never)
    expect((await m.POST(connectRequest({ tenant_id: 'store-1', page_id: 'page-1' }))).status).toBe(400)
  })
})
