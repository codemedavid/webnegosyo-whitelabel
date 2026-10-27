/** @jest-environment node */

import { NextRequest } from 'next/server'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { expenseRow } from './expense-row.fixture'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const mockVerify = jest.fn()
const mockBearerSeen = jest.fn()

const tables = {
  expenses: [
    expenseRow({ id: 'e1', tenant_id: TENANT, category_id: 'cat-lpg', spent_on: '2026-10-05', amount_cents: 125_000, note: 'LPG 11kg' }),
    expenseRow({ id: 'e2', tenant_id: TENANT, category_id: 'cat-lpg', spent_on: '2026-10-06', status: 'void', void_reason: 'typo' }),
    expenseRow({ id: 'outside', tenant_id: TENANT, spent_on: '2026-09-01' }),
  ],
  expense_categories: [
    { id: 'cat-lpg', tenant_id: TENANT, system_key: 'lpg', name: 'Gas / LPG', icon: 'LP', grp: 'utilities', needs_note: false, sort_order: 110, archived_at: null },
  ],
  suppliers: [],
  outlets: [],
  tenants: [{ id: TENANT, slug: 'lolys-cafe' }],
}

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const { getRequestBearerToken } = jest.requireActual('@/lib/supabase/bearer-session')
    mockBearerSeen(getRequestBearerToken())
    const fake = fakeSupabaseTables(tables)
    return { from: fake.client.from, rpc: async () => ({ data: null, error: null }) }
  },
}))

async function get(query: string, headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/api/expenses/export/route')
  return GET(new NextRequest(`http://localhost/api/expenses/export?${query}`, { headers }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockVerify.mockResolvedValue({ user: { id: 'owner-1' }, userRole: { role: 'admin', is_owner: true } })
})
afterEach(() => jest.restoreAllMocks())

describe('GET /api/expenses/export', () => {
  it('downloads the window as CSV with void rows, named for the store and dates', async () => {
    const response = await get(`tenantId=${TENANT}&from=2026-10-01&to=2026-10-31&format=csv`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="expenses-lolys-cafe-2026-10-01-to-2026-10-31.csv"')
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.text()
    expect(body).toContain('Date,Branch,Category')
    expect(body).toContain('1250.00')
    expect(body).toContain('typo')
    expect(body).not.toContain('2026-09-01')
    expect(mockVerify).toHaveBeenCalledWith(TENANT, 'expenses', 'view')
  })

  it('builds an Excel workbook, acting as the Bearer user for the app', async () => {
    const response = await get(`tenantId=${TENANT}&from=2026-10-01&to=2026-10-31&format=xlsx`, { authorization: 'Bearer app-token' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('content-disposition')).toContain('.xlsx')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]) // a zip, like every .xlsx
    expect(mockBearerSeen).toHaveBeenCalledWith('app-token')
  })

  it('refuses a caller without the expenses key', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    expect((await get(`tenantId=${TENANT}&from=2026-10-01&to=2026-10-31`)).status).toBe(403)
  })

  it.each([
    ['tenantId=nope&from=2026-10-01&to=2026-10-31'],
    [`tenantId=${TENANT}&from=2025-01-01&to=2026-10-31`],
    [`tenantId=${TENANT}&from=2026-10-01&to=2026-10-31&format=pdf`],
    [`tenantId=${TENANT}&from=2026-10-01&to=2026-10-31&outletId=nope`],
  ])('refuses a bad request before checking the caller: %s', async (query) => {
    expect((await get(query)).status).toBe(400)
    expect(mockVerify).not.toHaveBeenCalled()
  })
})
