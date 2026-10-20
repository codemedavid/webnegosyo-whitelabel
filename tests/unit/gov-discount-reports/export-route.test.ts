/** @jest-environment node */

import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-4111-8111-111111111111'

const mockVerify = jest.fn()
const mockLoad = jest.fn()

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => mockVerify(...args),
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ session: 'cookie' }) }))
jest.mock('@/lib/gov-discount-reports/load-ledger', () => ({
  loadLedgerWindow: (...args: unknown[]) => mockLoad(...args),
}))

async function get(query: string) {
  const { GET } = await import('@/app/api/gov-discounts/export/route')
  return GET(new NextRequest(`http://localhost/api/gov-discounts/export?${query}`))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockVerify.mockResolvedValue(undefined)
  mockLoad.mockResolvedValue({ rows: [], isTruncated: false })
})

afterEach(() => jest.restoreAllMocks())

describe('GET /api/gov-discounts/export', () => {
  it('returns the book as a CSV attachment named for the period', async () => {
    const response = await get(`tenantId=${TENANT}&book=senior&period=custom&from=2026-10-01&to=2026-10-31`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="senior-citizen-sales-book_2026-10.csv"')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.text()).toContain('Name of Senior Citizen')
  })

  it('reads with the caller’s cookie session after checking discount_review', async () => {
    await get(`tenantId=${TENANT}&book=summary`)
    expect(mockVerify).toHaveBeenCalledWith(TENANT, 'discount_review', 'view')
    expect(mockLoad.mock.calls[0][0]).toEqual({ session: 'cookie' })
    expect(mockLoad.mock.calls[0][1]).toBe(TENANT)
  })

  it('refuses a caller without the permission', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const response = await get(`tenantId=${TENANT}&book=pwd`)
    expect(response.status).toBe(403)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it.each([
    ['tenantId=nope&book=senior', 400],
    [`tenantId=${TENANT}&book=solo_parent`, 400],
    [`tenantId=${TENANT}`, 400],
  ])('rejects bad input: %s', async (query, status) => {
    expect((await get(query)).status).toBe(status)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('refuses to hand over an incomplete book', async () => {
    mockLoad.mockResolvedValue({ rows: [], isTruncated: true })
    expect((await get(`tenantId=${TENANT}&book=senior`)).status).toBe(413)
  })

  it('answers a read failure with a friendly 500', async () => {
    mockLoad.mockRejectedValue(new Error('db down'))
    const response = await get(`tenantId=${TENANT}&book=senior`)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('db down')
  })
})
