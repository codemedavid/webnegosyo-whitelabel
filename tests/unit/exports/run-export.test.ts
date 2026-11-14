import fc from 'fast-check'
import ExcelJS from 'exceljs'
import { strFromU8, unzipSync } from 'fflate'
import { MAX_DETAIL_DAYS } from '@/lib/exports/catalogue'
import { ExportError } from '@/lib/exports/errors'
import { previewExport, runExport, toExportFile, PEEK_ROWS, type ExportInput } from '@/lib/exports/run-export'
import { cashierIdOf, shiftOf } from '@/lib/exports/sheets/detail-sheets'
import type { DetailOrderRow, DetailShiftRow } from '@/lib/exports/sheets/detail-data'
import type { ReportOrder } from '@/lib/reports/sales-model'
import { toPlatformTables } from '../../fixtures/report-orders'
import { DAY, NOW, TENANT, access, contextFor, noReports, ordersArb, seedStore } from './export-fixtures'

const orders: ReportOrder[] = fc.sample(ordersArb(12), { numRuns: 1, seed: 11 })[0]

function input(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    context: contextFor({ period: 'custom', ...DAY }),
    storeName: 'Aling Nena’s Kitchen',
    access: access('reports', 'customers'),
    reportClient: noReports,
    detailClient: seedStore(orders).client,
    sheets: ['orders'],
    now: NOW,
    ...overrides,
  }
}

async function refusal(run: Promise<unknown>): Promise<ExportError> {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught,
  )
  if (!(error instanceof ExportError)) throw new Error(`expected a refusal, got ${String(error)}`)
  return error
}

describe('runExport: who gets what', () => {
  it('drops customer names and numbers for an account without the customers key, and says so', async () => {
    const result = await runExport(input({ access: access('reports'), sheets: ['orders', 'customers'] }))
    expect(result.sheets.map((sheet) => sheet.id)).toEqual(['orders'])
    const headers = result.sheets[0].columns.map((column) => column.header)
    expect(headers).not.toContain('Customer')
    expect(headers).not.toContain('Contact')
    expect(result.sheets[0].notes.join(' ')).toMatch(/Customer names and numbers are left out/)
    expect(result.leftOut).toEqual([expect.objectContaining({ id: 'customers', reason: 'no_permission' })])
  })

  it('refuses when nothing asked for may be exported', async () => {
    const error = await refusal(runExport(input({ access: access('reports'), sheets: ['customers'] })))
    expect(error.status).toBe(403)
    expect(error.message).toMatch(/Customers who ordered was left out/)
  })

  it('reads only the caller’s branch for a branch-locked account, whatever branch was asked for', async () => {
    const branch = 'bbbbbbbb-0000-4000-8000-000000000002'
    const store = seedStore(orders.map((order, index) => ({ ...order, outletId: index % 2 === 0 ? branch : null })))
    const locked = { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['reports'], outlet_id: branch }
    const result = await runExport(
      input({ context: contextFor({ period: 'custom', ...DAY, branch: 'unassigned' }, locked), detailClient: store.client }),
    )
    expect(result.sheets[0].rows).toHaveLength(Math.ceil(orders.length / 2))
    expect(result.header.branchLabel).toBe('Your branch')
  })
})

describe('runExport: nothing is cut short quietly', () => {
  it('refuses a row-level sheet over a range longer than it can list', async () => {
    const error = await refusal(runExport(input({ context: contextFor({ period: 'custom', from: '2026-06-01', to: '2026-10-13' }) })))
    expect(error.status).toBe(400)
    expect(error.message).toContain(`up to ${MAX_DETAIL_DAYS} days`)
  })

  it('refuses dates the report could not use, instead of exporting the default week', async () => {
    const error = await refusal(runExport(input({ context: contextFor({ period: 'custom', from: '2026-10-13', to: '2026-10-01' }) })))
    expect(error.status).toBe(400)
  })

  it('fails the export when a read fails', async () => {
    const broken = { from: () => { throw new Error('boom') } } as unknown as ExportInput['detailClient']
    await expect(runExport(input({ detailClient: broken }))).rejects.toThrow()
  })
})

describe('cashier and shift', () => {
  const shift: DetailShiftRow = {
    id: 's1',
    staff_user_id: 'u1',
    staff_name: 'Maria',
    drawer_name: 'Front till',
    outlet_id: null,
    opened_at: '2026-10-13T00:00:00Z',
    closed_at: '2026-10-13T08:00:00Z',
  }
  const order = (patch: Partial<DetailOrderRow>): DetailOrderRow =>
    ({ id: 'o', source: 'pos', outlet_id: null, customer_data: { pos: { cashierId: 'u1' } }, ...patch }) as DetailOrderRow

  it('reads the cashier only from register orders', () => {
    expect(cashierIdOf(order({}))).toBe('u1')
    expect(cashierIdOf(order({ source: 'web' }))).toBeNull()
    expect(cashierIdOf(order({ customer_data: null }))).toBeNull()
  })

  it('puts an order in the cashier’s own shift at that branch, open when it was placed', () => {
    const at = Date.parse('2026-10-13T03:00:00Z')
    expect(shiftOf(order({}), at, [shift])?.id).toBe('s1')
    expect(shiftOf(order({}), Date.parse('2026-10-13T08:00:00Z'), [shift])).toBeNull()
    expect(shiftOf(order({ outlet_id: 'other' }), at, [shift])).toBeNull()
    expect(shiftOf(order({ customer_data: { pos: { cashierId: 'u2' } } }), at, [shift])).toBeNull()
  })

  it('names the cashier and the shift on the Orders sheet; an online order has neither', async () => {
    const rung = orders.map((o, index) => ({ ...o, channel: index === 0 ? ('online' as const) : ('counter' as const), outletId: null }))
    const stamped = toPlatformTables(rung, { tenantId: TENANT }).orders.map((row) => ({
      ...row,
      customer_data: { ...(row.customer_data as object), pos: { cashierId: 'u1' } },
    }))
    const seed = seedStore(rung, {
      orders: stamped,
      staff_shifts: [{ ...shift, tenant_id: TENANT, opened_at: '2026-09-30T16:00:00Z', closed_at: null }],
    })
    const sheet = (await runExport(input({ detailClient: seed.client }))).sheets[0]
    const column = (id: string) => sheet.columns.findIndex((entry) => entry.id === id)
    const byId = new Map(sheet.rows.map((row) => [row[column('order_id')], row]))
    const online = byId.get(rung[0].id)!
    const counter = byId.get(rung[1].id)!
    expect(online[column('cashier')]).toBeNull()
    expect(online[column('shift')]).toBeNull()
    expect(counter[column('cashier')]).toBe('Maria')
    expect(counter[column('shift')]).toBe('Front till · opened 2026-10-01 00:00')
    expect(sheet.notes.join(' ')).not.toMatch(/Cashier and Shift are blank/)
  })
})

describe('preview', () => {
  it('counts the orders without reading them all, and shows the first rows', async () => {
    const store = seedStore(orders)
    const preview = await previewExport(input({ detailClient: store.client, sheets: ['orders', 'order_lines'] }))
    const [ordersSheet, lines] = preview.sheets
    expect(ordersSheet.rows).toBe(orders.length)
    expect(ordersSheet.peek).toHaveLength(Math.min(PEEK_ROWS, orders.length))
    expect(ordersSheet.columns).toContain('Order total')
    expect(lines.rows).toBeNull()
    // The orders table was asked for one counted head request and one page of five.
    const orderReads = store.requests.filter((request) => request.table === 'orders')
    expect(orderReads.reduce((sum, request) => sum + request.returned, 0)).toBe(Math.min(PEEK_ROWS, orders.length))
  })
})

describe('the file', () => {
  it('writes an Excel tab per sheet with the header block, numbers as numbers and text as text', async () => {
    const tricky = orders.map((order, index) => (index === 0 ? { ...order, methodName: '=HYPERLINK("http://x")' } : order))
    const context = contextFor({ period: 'custom', ...DAY })
    const result = await runExport(input({ context, detailClient: seedStore(tricky).client, sheets: ['orders', 'order_lines'] }))
    const file = await toExportFile(result, context, 'xlsx')
    expect(file.name).toBe('aling-nenas-kitchen-export-2026-10-01.xlsx')

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(file.bytes) as never)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Orders', 'Order lines'])
    const sheet = workbook.getWorksheet('Orders')!
    expect(sheet.getCell('A1').value).toBe('Aling Nena’s Kitchen')
    expect(sheet.getCell('B3').value).toBe('2026-10-01')
    expect(String(sheet.getCell('B5').value)).toMatch(/Manila time/)

    // Store, sheet, period, branch, as of, one note, a blank line, then the table.
    const headerRow = 8
    expect(sheet.getCell('A6').value).toBe('Note')
    const headers = (sheet.getRow(headerRow).values as unknown[]).slice(1)
    expect(headers).toEqual(result.sheets[0].columns.map((column) => column.header))
    const total = headers.indexOf('Order total') + 1
    const method = headers.indexOf('Payment method') + 1
    const first = sheet.getRow(headerRow + 1)
    expect(typeof first.getCell(total).value).toBe('number')
    expect(first.getCell(total).numFmt).toBe('#,##0.00')
    // A formula-looking name stays a string cell: Excel shows it, never runs it.
    expect(first.getCell(method).value).toBe('=HYPERLINK("http://x")')
    expect(first.getCell(method).formula).toBeUndefined()
  })

  it('writes one CSV for one sheet and a zip for several, guarding formula-looking text', async () => {
    const tricky = orders.map((order, index) => (index === 0 ? { ...order, methodName: '=1+1' } : order))
    const context = contextFor({ period: 'custom', ...DAY })
    const one = await runExport(input({ context, detailClient: seedStore(tricky).client }))
    const csv = await toExportFile(one, context, 'csv')
    expect(csv.name).toBe('aling-nenas-kitchen-orders-2026-10-01.csv')
    const text = strFromU8(csv.bytes)
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain("'=1+1")
    expect(text).toContain('Period,2026-10-01')

    const two = await runExport(input({ context, detailClient: seedStore(tricky).client, sheets: ['orders', 'order_lines'] }))
    const zip = await toExportFile(two, context, 'csv')
    expect(zip.name).toMatch(/\.zip$/)
    const files = unzipSync(zip.bytes)
    expect(Object.keys(files).sort()).toEqual(['order-lines.csv', 'orders.csv'])
    expect(strFromU8(files['orders.csv'])).toContain('Order total')
  })
})
