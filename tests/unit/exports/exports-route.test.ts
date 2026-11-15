/** @jest-environment node */

import fc from 'fast-check'
import { NextRequest } from 'next/server'
import { customReportSpecSchema, encodeCustomSpec } from '@/lib/exports/custom-report'
import { reportFormatSpecSchema } from '@/lib/exports/report-format'
import type { ReportTemplate } from '@/lib/exports/report-templates'
import type { ExportInput } from '@/lib/exports/run-export'
import { DAY, NOW, TENANT, access, contextFor, noReports, ordersArb, seedStore } from './export-fixtures'

const mockRateLimit = jest.fn()
const mockLoad = jest.fn()
const mockLog = jest.fn()
const mockVerifyPermission = jest.fn()
const mockTemplate = jest.fn()
const mockCards = jest.fn()

// The access check is the app's existing helper; `defineRoute` and everything after it are real.
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn(),
  verifyTenantPermission: (...args: unknown[]) => mockVerifyPermission(...args),
}))

jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/exports/server/load-export-input', () => ({ loadExportInput: (...args: unknown[]) => mockLoad(...args) }))
jest.mock('@/lib/exports/server/report-templates', () => ({
  getReportTemplate: (...args: unknown[]) => mockTemplate(...args),
  loadTemplateCards: (...args: unknown[]) => mockCards(...args),
}))
jest.mock('@/lib/exports/server/export-log', () => ({ logExport: (...args: unknown[]) => mockLog(...args) }))

const orders = fc.sample(ordersArb(8), { numRuns: 1, seed: 3 })[0]

function ready(overrides: Partial<ExportInput> = {}) {
  return {
    kind: 'ready',
    userId: 'user-1',
    input: {
      context: contextFor({ period: 'custom', ...DAY }),
      storeName: 'Shop',
      access: access('reports'),
      reportClient: noReports,
      detailClient: seedStore(orders).client,
      sheets: ['orders'],
      now: NOW,
      ...overrides,
    },
  }
}

const QUERY = `tenantId=${TENANT}&sheets=orders&period=custom&from=${DAY.from}&to=${DAY.to}`

async function get(query = QUERY) {
  const { GET } = await import('@/app/api/exports/route')
  return GET(new NextRequest(`http://localhost/api/exports?${query}`))
}

async function post(body: unknown) {
  const { POST } = await import('@/app/api/exports/route')
  return POST(new NextRequest('http://localhost/api/exports', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 60 })
  mockVerifyPermission.mockResolvedValue({
    user: { id: 'user-1' },
    userRole: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null },
  })
  mockLoad.mockResolvedValue(ready())
  mockLog.mockResolvedValue(undefined)
  mockTemplate.mockResolvedValue(null)
  mockCards.mockResolvedValue([])
})
afterEach(() => jest.restoreAllMocks())

describe('GET /api/exports (the file)', () => {
  it('sends the file as an attachment and logs it first', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="shop-orders-2026-10-01.xlsx"')
    expect(response.headers.get('cache-control')).toMatch(/no-store/)
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(bytes.length).toBe(Number(response.headers.get('content-length')))
    // An .xlsx is a zip: "PK".
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    expect(mockLog).toHaveBeenCalledTimes(1)
    const [userId, request, , result, size] = mockLog.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(request).toMatchObject({ tenantId: TENANT, format: 'xlsx', source: 'page' })
    expect(result.sheets[0].rows).toHaveLength(orders.length)
    expect(size).toBe(bytes.length)
  })

  it('sends no file when the log row could not be written', async () => {
    mockLog.mockRejectedValue(new Error('export log not written: rls'))
    const response = await get()
    expect(response.status).toBe(500)
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await response.json()).toEqual({ success: false, error: 'The export could not be prepared. Try again in a moment.' })
  })

  it('refuses a link with an unknown sheet, a missing store or an extra format', async () => {
    expect((await get(QUERY.replace('sheets=orders', 'sheets=orders,passwords'))).status).toBe(400)
    expect((await get(QUERY.replace(`tenantId=${TENANT}&`, ''))).status).toBe(400)
    expect((await get(`${QUERY}&format=pdf`)).status).toBe(400)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'signed_out' }, 401],
    [{ kind: 'not_found' }, 404],
    [{ kind: 'refused', reason: 'no_permission' }, 403],
    [{ kind: 'unsupported', backend: 'convex' }, 409],
  ])('answers %j with %i and builds nothing', async (loaded, status) => {
    mockLoad.mockResolvedValue(loaded)
    const response = await get()
    expect(response.status).toBe(status)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('is limited per person and per store', async () => {
    mockRateLimit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith('exports:store:'), remaining: 0, retryAfterSec: 42 }))
    const response = await get()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    const keys = mockRateLimit.mock.calls.map(([key]) => String(key))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toContain('exports-file')
    expect(keys[0]).toContain('user-1')
    expect(keys[1]).toBe(`exports:store:${TENANT}`)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('never reaches the builder for an account without the Reports key', async () => {
    mockVerifyPermission.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const response = await get()
    expect(response.status).toBe(403)
    expect(mockVerifyPermission).toHaveBeenCalledWith(TENANT, 'reports', 'view')
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('passes a refusal the person can act on straight through', async () => {
    mockLoad.mockResolvedValue(ready({ context: contextFor({ period: 'custom', from: '2026-05-01', to: '2026-10-01' }) }))
    const response = await get()
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/up to 93 days/)
  })
})

describe('a custom report (one sheet, reshaped)', () => {
  const custom = customReportSpecSchema.parse({
    title: 'Biggest orders',
    sheet: 'orders',
    columns: [{ id: 'total', header: 'Bill' }, { id: 'order_no' }],
    sort: { column: 'total', descending: true },
    top: 3,
  })

  it('the link builds the reshaped file and logs it under the sheet it came from', async () => {
    const response = await get(`${QUERY}&custom=${encodeCustomSpec(custom)}&source=owl`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="shop-biggest-orders-2026-10-01.xlsx"')
    expect(response.headers.get('x-export-sheets')).toBe('orders')
    const [, request, , result] = mockLog.mock.calls[0]
    expect(request).toMatchObject({ source: 'owl', sheets: ['orders'] })
    const [sheet] = result.sheets
    expect(sheet.name).toBe('Biggest orders')
    expect(sheet.columns.map((column: { header: string }) => column.header)).toEqual(['Bill', 'Order no.'])
    expect(sheet.rows).toHaveLength(Math.min(3, orders.length))
    const bills = sheet.rows.map((row: number[]) => row[0])
    expect(bills).toEqual([...bills].sort((a, b) => b - a))
  })

  it('refuses a link whose spec is not a spec, or that asks for another sheet than its own', async () => {
    expect((await get(`${QUERY}&custom=AAAA`)).status).toBe(400)
    expect((await get(`${QUERY.replace('sheets=orders', 'sheets=items')}&custom=${encodeCustomSpec(custom)}`)).status).toBe(400)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('refuses a column this account does not get, with the columns it has', async () => {
    const hidden = customReportSpecSchema.parse({ ...custom, columns: [{ id: 'order_no' }, { id: 'margin' }], sort: null })
    const response = await get(`${QUERY}&custom=${encodeCustomSpec(hidden)}`)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/no column called "margin"/)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('previews exactly what the file will hold', async () => {
    const response = await post({ tenantId: TENANT, mode: 'preview', sheets: ['orders'], period: { preset: 'custom', ...DAY }, custom })
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(preview.sheets).toHaveLength(1)
    expect(preview.sheets[0]).toMatchObject({ id: 'orders', name: 'Biggest orders', columns: ['Bill', 'Order no.'], rows: Math.min(3, orders.length) })
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('counts its preview against the store (it reads the whole period, like a file)', async () => {
    mockRateLimit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith('exports:store-preview:'), remaining: 0, retryAfterSec: 9 }))
    const response = await post({ tenantId: TENANT, mode: 'preview', sheets: ['orders'], period: { preset: 'custom', ...DAY }, custom })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('9')
    expect(mockRateLimit.mock.calls.map(([key]) => String(key))).toContain(`exports:store-preview:${TENANT}`)
  })

  it('leaves the plain preview (first 1,500 orders) out of the store count', async () => {
    await post({ tenantId: TENANT, mode: 'preview', sheets: ['orders'], period: { preset: 'custom', ...DAY } })
    expect(mockRateLimit.mock.calls.map(([key]) => String(key))).not.toContain(`exports:store-preview:${TENANT}`)
  })
})

describe('a saved format (named by its id; the server reads its shape)', () => {
  const ID = 'bbbbbbbb-0000-4000-8000-000000000001'
  const layout: ReportTemplate = {
    id: ID,
    name: 'Monthly para kay Ate',
    kind: 'format',
    savedBy: 'Ana',
    savedAt: '2026-11-14T02:00:00Z',
    spec: reportFormatSpecSchema.parse({
      tabs: [
        { title: 'Mga bill', sheet: 'orders', columns: [{ header: 'Halaga', id: 'total' }, { header: 'Resibo', id: 'order_no' }, { header: 'Remarks', id: null }], sort: { column: 'total', descending: true }, top: 3 },
        { title: 'Lahat', sheet: 'orders', columns: [{ header: 'Resibo', id: 'order_no' }] },
      ],
    }),
  }
  const saved: ReportTemplate = {
    id: ID,
    name: 'Biggest bills',
    kind: 'custom',
    savedBy: null,
    savedAt: '2026-11-14T02:00:00Z',
    spec: customReportSpecSchema.parse({ title: 'Biggest orders', sheet: 'orders', columns: [{ id: 'total', header: 'Bill' }], sort: { column: 'total', descending: true }, top: 2 }),
  }

  it('builds the owner’s tabs from the format’s own sheets, whatever the link says, and names the file after it', async () => {
    mockTemplate.mockResolvedValue(layout)
    // The link asks for another sheet: the format decides.
    const response = await get(`${QUERY.replace('sheets=orders', 'sheets=summary')}&template=${ID}&source=owl`)
    expect(response.status).toBe(200)
    expect(mockTemplate).toHaveBeenCalledWith(TENANT, ID)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="shop-monthly-para-kay-ate-2026-10-01.xlsx"')
    const [, , , result] = mockLog.mock.calls[0]
    expect(result.sheets.map((sheet: { name: string }) => sheet.name)).toEqual(['Mga bill', 'Lahat'])
    const [bills, all] = result.sheets
    expect(bills.columns.map((column: { header: string }) => column.header)).toEqual(['Halaga', 'Resibo', 'Remarks'])
    expect(bills.rows).toHaveLength(Math.min(3, orders.length))
    // The column the store has no figure for is there, and empty.
    expect(bills.rows.every((row: unknown[]) => row[2] === null)).toBe(true)
    const amounts = bills.rows.map((row: number[]) => row[0])
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
    expect(all.rows).toHaveLength(orders.length)
  })

  it('runs a saved custom report the same way', async () => {
    mockTemplate.mockResolvedValue(saved)
    const response = await get(`${QUERY}&template=${ID}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="shop-biggest-bills-2026-10-01.xlsx"')
    const [, , , result] = mockLog.mock.calls[0]
    expect(result.sheets[0]).toMatchObject({ name: 'Biggest orders' })
    expect(result.sheets[0].rows).toHaveLength(Math.min(2, orders.length))
  })

  it('refuses a format that is gone or not this account’s, an id that is not one, and a link that names both', async () => {
    const gone = await get(`${QUERY}&template=${ID}`)
    expect(gone.status).toBe(404)
    expect((await gone.json()).error).toMatch(/saved format is gone/)
    expect((await get(`${QUERY}&template=1`)).status).toBe(400)
    expect((await get(`${QUERY}&template=${ID}&custom=${encodeCustomSpec(saved.spec as never)}`)).status).toBe(400)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('refuses a format whose column this account does not get', async () => {
    mockTemplate.mockResolvedValue({ ...layout, spec: reportFormatSpecSchema.parse({ tabs: [{ title: 'Kita', sheet: 'orders', columns: [{ header: 'Tubo', id: 'margin' }] }] }) })
    const response = await get(`${QUERY}&template=${ID}`)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/“Kita” tab uses "margin"/)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('previews each of its tabs, told apart even when two come from one sheet', async () => {
    mockTemplate.mockResolvedValue(layout)
    const response = await post({ tenantId: TENANT, mode: 'preview', sheets: ['orders'], period: { preset: 'custom', ...DAY }, template: ID })
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(preview.sheets.map((sheet: { id: string; name: string }) => [sheet.id, sheet.name])).toEqual([['orders:1', 'Mga bill'], ['orders:2', 'Lahat']])
    expect(preview.sheets[0]).toMatchObject({ columns: ['Halaga', 'Resibo', 'Remarks'], rows: Math.min(3, orders.length) })
    expect(preview.sheets[0].notes).toContain('Left blank (the store has no figure for it): Remarks.')
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('lists the saved formats in the catalogue without their shape', async () => {
    mockCards.mockResolvedValue([{ id: ID, name: 'Monthly para kay Ate', kind: 'format', summary: 'Your format · 2 tabs', savedBy: 'Ana', sheets: ['orders'], isDetail: true, lockedNote: null }])
    const response = await post({ tenantId: TENANT, mode: 'catalogue', sheets: ['summary'], period: { preset: 'custom', ...DAY } })
    const { catalogue } = await response.json()
    expect(catalogue.formats).toEqual([{ id: ID, name: 'Monthly para kay Ate', kind: 'format', summary: 'Your format · 2 tabs', savedBy: 'Ana', sheets: ['orders'], isDetail: true, lockedNote: null }])
  })
})

describe('POST /api/exports (the preview)', () => {
  const body = { tenantId: TENANT, mode: 'preview', sheets: ['orders'], period: { preset: 'custom', ...DAY } }

  it('describes the file without logging or sending it', async () => {
    const response = await post(body)
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(preview.sheets[0]).toMatchObject({ id: 'orders', name: 'Orders', rows: orders.length })
    expect(preview.sheets[0].peek.length).toBeLessThanOrEqual(5)
    expect(preview.header.periodLabel).toBe('2026-10-01')
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('refuses an unknown field instead of ignoring it', async () => {
    expect((await post({ ...body, everything: true })).status).toBe(400)
    expect((await post('nope')).status).toBe(400)
  })

  it('lists what this account may pick, without reading an order', async () => {
    const response = await post({ ...body, mode: 'catalogue', sheets: ['summary'] })
    expect(response.status).toBe(200)
    const { catalogue } = await response.json()
    const cards = catalogue.groups.flatMap((group: { cards: { id: string; lockedNote: string | null }[] }) => group.cards)
    // The fixture account holds `reports` only: sales sheets are open, the books are locked with a reason.
    expect(cards.find((card: { id: string }) => card.id === 'orders').lockedNote).toBeNull()
    expect(cards.find((card: { id: string }) => card.id === 'expenses').lockedNote).toMatch(/Not on your account/)
    // Single-branch store: the branches sheet is not offered at all.
    expect(cards.some((card: { id: string }) => card.id === 'branches')).toBe(false)
    expect(catalogue.defaults).toEqual(['summary', 'sales_by_day', 'items', 'orders'])
    for (const pack of catalogue.packs) {
      expect(pack.sheets.length).toBeGreaterThan(0)
      expect(pack.sheets).not.toContain('expenses')
    }
    expect(catalogue.packs.map((pack: { id: string }) => pack.id)).toEqual(['everything', 'accountant'])
    expect(catalogue).toMatchObject({ maxDetailDays: 93, today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), branchLabel: null })
    expect(mockLog).not.toHaveBeenCalled()
  })
})
