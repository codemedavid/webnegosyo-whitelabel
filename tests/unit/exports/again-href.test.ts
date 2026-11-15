import { againHref } from '@/lib/exports/again-href'
import { decodeCustomSpec } from '@/lib/exports/custom-report'
import type { ExportLogEntry } from '@/lib/exports/server/export-log'

jest.mock('server-only', () => ({}))

const TENANT = '72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2'
const TEMPLATE = '0b8f6a0e-6f7c-4d55-9b0e-2b7a1c3d4e5f'

function entry(overrides: Partial<ExportLogEntry>): ExportLogEntry {
  return {
    id: 'e1',
    userLabel: null,
    sheets: ['orders'],
    leftOut: [],
    preset: 'today',
    periodFrom: '2026-11-14',
    periodTo: '2026-11-15',
    branch: null,
    format: 'xlsx',
    source: 'page',
    rowCounts: {},
    bytes: 1,
    createdAt: '2026-11-15T00:00:00Z',
    shape: { kind: 'sheets' },
    ...overrides,
  }
}

function params(href: string | null): URLSearchParams {
  expect(href).not.toBeNull()
  return new URL(`https://x${href}`).searchParams
}

describe('againHref: "Download again" rebuilds the same file, not just its sheets', () => {
  it('plain sheets keep their sheets, dates and branch', () => {
    const query = params(againHref(TENANT, entry({ sheets: ['orders', 'order_lines'], branch: 'unassigned', format: 'csv' })))
    expect(query.get('sheets')).toBe('orders,order_lines')
    expect(query.get('from')).toBe('2026-11-14')
    expect(query.get('to')).toBe('2026-11-15')
    expect(query.get('branch')).toBe('unassigned')
    expect(query.get('format')).toBe('csv')
    expect(query.get('custom')).toBeNull()
    expect(query.get('template')).toBeNull()
  })

  it('a custom report carries its spec (before 2026-11-15 it came back as the raw sheet)', () => {
    const spec = { title: 'Mine', sheet: 'orders' as const, columns: [{ id: 'total' }], filters: [], sort: null, top: null }
    const query = params(againHref(TENANT, entry({ shape: { kind: 'custom', spec } as ExportLogEntry['shape'] })))
    expect(query.get('sheets')).toBe('orders')
    expect(decodeCustomSpec(query.get('custom') ?? '')).toMatchObject({ title: 'Mine', sheet: 'orders' })
  })

  it("a saved format carries its id, even when its tabs were logged as 'sheet:n'", () => {
    const query = params(againHref(TENANT, entry({ sheets: ['orders:1', 'orders:2'], shape: { kind: 'template', templateId: TEMPLATE } })))
    expect(query.get('template')).toBe(TEMPLATE)
    expect(query.get('sheets')).toBe('orders')
  })

  it('offers nothing when the file cannot be made the same way any more', () => {
    expect(againHref(TENANT, entry({ shape: { kind: 'template', templateId: null } }))).toBeNull()
    expect(againHref(TENANT, entry({ shape: { kind: 'custom', spec: null } }))).toBeNull()
    expect(againHref(TENANT, entry({ sheets: ['retired_sheet'] }))).toBeNull()
  })
})
