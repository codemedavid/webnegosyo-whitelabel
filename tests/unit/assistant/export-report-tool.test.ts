/**
 * export_report: Owl names sheets, the server decides what the file holds,
 * and the card only ever links to our own export route.
 */
import { isExportHref } from '@/components/admin/assistant/file-card'
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools'
import { buildExportResult, exportReportTool } from '@/lib/assistant/tools/reads/export-report'
import { availableTools } from '@/lib/assistant/tools/registry'
import { exportQuerySchema } from '@/lib/exports/request-schema'
import type { ExportPreview } from '@/lib/exports/run-export'

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const preview: ExportPreview = {
  header: { storeName: 'Shop', periodLabel: '2026-11-14 (so far)', branchLabel: 'Whole store', asOf: '2026-11-14 09:00 (Manila time)' },
  sheets: [
    { id: 'orders', name: 'Orders', rowIs: 'one order', columns: ['Order no.'], kinds: ['text'], rows: 44, peek: [['1']], notes: [] },
    { id: 'order_lines', name: 'Order lines', rowIs: 'one dish', columns: ['Item'], kinds: ['text'], rows: null, peek: [], notes: [] },
  ],
  leftOut: [{ id: 'customers', name: 'Customers who ordered', reason: 'no_permission', note: 'Customers who ordered was left out: your account does not have access to it.' }],
}
const request = {
  tenantId: TENANT,
  sheets: ['orders', 'order_lines'] as const,
  period: { preset: 'custom' as const, from: '2026-11-14', to: '2026-11-14' },
  branch: null,
  format: 'xlsx' as const,
  source: 'owl' as const,
}

describe('export_report result', () => {
  const result = buildExportResult(preview, { ...request, sheets: [...request.sheets] }, '/reports/export?period=custom')

  it('tells the model which tabs and how many rows, never the rows themselves', () => {
    expect(result.facts).toMatchObject({ ready: true, period: '2026-11-14 (so far)', tabs: [{ name: 'Orders', rows: 44 }, { name: 'Order lines', rows: null }] })
    expect(JSON.stringify(result.facts)).not.toContain('peek')
    expect(result.facts.leftOut).toEqual([preview.leftOut[0].note])
  })

  it('links only to the export route, as a request that route accepts, marked as made by Owl', () => {
    if (result.card?.type !== 'file') throw new Error('expected a file card')
    expect(result.card.downloads.map((download) => download.label)).toEqual(['Download Excel', 'CSV'])
    for (const download of result.card.downloads) {
      expect(isExportHref(download.href)).toBe(true)
      const query = Object.fromEntries(new URL(download.href, 'https://x.test').searchParams)
      const parsed = exportQuerySchema.safeParse(query)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.source).toBe('owl')
        expect(parsed.data.sheets).toEqual(['orders', 'order_lines'])
        expect(parsed.data.tenantId).toBe(TENANT)
      }
    }
    expect(result.card.notes).toEqual([preview.leftOut[0].note])
  })
})

describe('file card links', () => {
  it('refuses anything but a path to our own export route', () => {
    for (const bad of ['https://evil.example/api/exports?x=1', '//evil.example/api/exports?x=1', '/api/exports', '/api/assistant?x=1', 'javascript:alert(1)', '/api/exports?next=//evil', null]) {
      expect(isExportHref(bad)).toBe(false)
    }
  })
})

describe('who gets the tool', () => {
  const flags = { inventoryEnabled: false, customerHubOn: false, menuEngineeringEnabled: false, isPlatformOrders: true }
  const staff = (permissions: string[]) => ({ role: 'admin', tenant_id: TENANT, is_owner: false, permissions, outlet_id: null }) as never
  const names = (caller: never, tenantFlags = flags) => availableTools(ASSISTANT_TOOLS, caller, tenantFlags).map((tool) => tool.name)

  it('needs the Reports key and a store whose orders are on the platform database', () => {
    expect(names(staff(['assistant', 'reports']))).toContain('export_report')
    expect(names(staff(['assistant', 'orders']))).not.toContain('export_report')
    expect(names(staff(['assistant', 'reports']), { ...flags, isPlatformOrders: false })).not.toContain('export_report')
  })

  it('is appended after every older tool, so the cached prompt prefix before it is unchanged', () => {
    expect(ASSISTANT_TOOLS.slice(-3).map((tool) => tool.name)).toEqual([exportReportTool.name, 'get_shifts', 'get_profit'])
  })
})
