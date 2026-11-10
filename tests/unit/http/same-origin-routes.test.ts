/**
 * @jest-environment node
 *
 * Cookie-authenticated routes that change a store must refuse a request sent
 * from a page elsewhere: the browser attaches the session cookie by itself.
 * Refused BEFORE any session or database work.
 */
import { NextRequest } from 'next/server'

const mockCreateClient = jest.fn()
const mockConsoleCaller = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/platform-staff/guard', () => ({ getConsoleCaller: (...args: unknown[]) => mockConsoleCaller(...args) }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/facebook-api', () => ({ unsubscribePageFromWebhook: jest.fn(), getUserPages: jest.fn(), subscribePageToWebhook: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getTenantPageByPageId: jest.fn(), getTenantUserAccessToken: jest.fn() }))
jest.mock('@/lib/menu-import/import-parsed-menu', () => ({ importParsedMenu: jest.fn() }))

const FOREIGN = { origin: 'https://evil.example', host: 'www.webnegosyo.com', 'content-type': 'application/json' }
const params = { params: Promise.resolve({ id: 'tenant-1' }) }
const BODY = JSON.stringify({ tenant_id: 'tenant-1', page_id: 'page-1', temp_id: 'temp-1' })

function foreign(path: string, method: string) {
  return new NextRequest(`https://www.webnegosyo.com${path}`, {
    method,
    headers: FOREIGN,
    ...(method === 'DELETE' ? {} : { body: BODY }),
  })
}

describe('cross-site refusal', () => {
  beforeEach(() => {
    mockCreateClient.mockReset()
    mockConsoleCaller.mockReset()
  })

  it('DELETE /api/tenants/[id]', async () => {
    const { DELETE } = await import('@/app/api/tenants/[id]/route')
    const res = await DELETE(foreign('/api/tenants/tenant-1', 'DELETE'), params)
    expect(res.status).toBe(403)
    expect(mockConsoleCaller).not.toHaveBeenCalled()
  })

  it('POST /api/tenants/[id]/bulk-menu-import', async () => {
    const { POST } = await import('@/app/api/tenants/[id]/bulk-menu-import/route')
    const res = await POST(foreign('/api/tenants/tenant-1/bulk-menu-import', 'POST'), params)
    expect(res.status).toBe(403)
    expect(mockConsoleCaller).not.toHaveBeenCalled()
  })

  it('POST /api/auth/facebook/disconnect', async () => {
    const { POST } = await import('@/app/api/auth/facebook/disconnect/route')
    const res = await POST(foreign('/api/auth/facebook/disconnect', 'POST'))
    expect(res.status).toBe(403)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('POST /api/auth/facebook/connect', async () => {
    const { POST } = await import('@/app/api/auth/facebook/connect/route')
    const res = await POST(foreign('/api/auth/facebook/connect', 'POST'))
    expect(res.status).toBe(403)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
