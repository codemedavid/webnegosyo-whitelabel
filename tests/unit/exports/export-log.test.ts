/** @jest-environment node */
import { listRecentExports, logExport } from '@/lib/exports/server/export-log'

jest.mock('server-only', () => ({}))

const inserted: Array<Record<string, unknown>> = []
let rows: Array<Record<string, unknown>> = []

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'app_users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Ana' } }) }) }) }
      }
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return { select: async () => ({ data: [{ id: 'new' }], error: null }) }
        },
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
      }
    },
  }),
}))

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const TEMPLATE = '0b8f6a0e-6f7c-4d55-9b0e-2b7a1c3d4e5f'
const context = { period: { from: '2026-11-15', to: '2026-11-15' }, branch: { branch: null } } as never
const result = { sheets: [{ id: 'orders', rows: [1, 2] }], leftOut: [] } as never
const base = { tenantId: TENANT, period: { preset: 'today' as const }, format: 'xlsx' as const, source: 'page' as const }

beforeEach(() => {
  inserted.length = 0
  rows = []
})

describe('export log keeps what shaped the file (20261115150000)', () => {
  it('plain sheets, custom report and saved format each write their shape', async () => {
    const spec = { title: 'Mine', sheet: 'orders' as const, columns: [{ id: 'total' }], filters: [], sort: null, top: null }
    await logExport('u1', { ...base, custom: null, template: null }, context, result, 10)
    await logExport('u1', { ...base, custom: spec, template: null }, context, result, 10)
    await logExport('u1', { ...base, custom: null, template: TEMPLATE }, context, result, 10)
    expect(inserted.map((row) => [row.shape, row.custom_spec ?? null, row.template_id ?? null])).toEqual([
      ['sheets', null, null],
      ['custom', spec, null],
      ['template', null, TEMPLATE],
    ])
  })

  it('reads rows back as shapes; an old row is plain sheets and a stale spec is listed but not usable', async () => {
    const row = { id: 'a', sheets: ['orders'], left_out: [], preset: 'today', period_from: '2026-11-15', period_to: '2026-11-15', format: 'xlsx', source: 'page', row_counts: {}, bytes: 1, created_at: 'x' }
    rows = [
      { ...row, id: 'old' },
      { ...row, id: 'custom', shape: 'custom', custom_spec: { title: 'Mine', sheet: 'orders', columns: [{ id: 'total' }] } },
      { ...row, id: 'stale', shape: 'custom', custom_spec: { nonsense: true } },
      { ...row, id: 'gone', shape: 'template', template_id: null },
    ]
    const entries = await listRecentExports(TENANT)
    expect(entries.map((entry) => [entry.id, entry.shape.kind, 'spec' in entry.shape ? entry.shape.spec !== null : null])).toEqual([
      ['old', 'sheets', null],
      ['custom', 'custom', true],
      ['stale', 'custom', false],
      ['gone', 'template', null],
    ])
  })
})
