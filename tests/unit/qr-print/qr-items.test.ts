import { describe, it, expect } from '@jest/globals'
import { buildQrCatalog, tableTitle, type QrCatalogInput } from '@/lib/qr-print/qr-items'

const BASE = 'https://cafe.webnegosyo.com'

const catalogInput = (overrides: Partial<QrCatalogInput> = {}): QrCatalogInput => ({
  tenantSlug: 'cafe',
  baseUrl: BASE,
  isMultiBranch: true,
  outlets: [
    { id: 'o1', name: 'North', slug: 'north', isActive: true },
    { id: 'o2', name: 'South', slug: 'south', isActive: true },
    { id: 'o3', name: 'Closed', slug: 'closed', isActive: false },
  ],
  tables: [
    { id: 't2', label: '10', outletId: 'o1', zone: null },
    { id: 't1', label: '2', outletId: 'o1', zone: 'Patio' },
    { id: 't3', label: 'Bar', outletId: 'o2', zone: null },
  ],
  extraTables: [],
  ...overrides,
})

describe('buildQrCatalog', () => {
  it('gives the store one code that opens the menu', () => {
    const { store } = buildQrCatalog(catalogInput())
    expect(store.url).toBe(`${BASE}/menu`)
    expect(store.fileName).toBe('cafe-menu-qr')
    expect(store.title).toBeNull()
  })

  it('gives every active branch its own code, and skips closed ones', () => {
    const { branches } = buildQrCatalog(catalogInput())
    expect(branches.map((b) => b.url)).toEqual([`${BASE}/menu?outlet=north`, `${BASE}/menu?outlet=south`])
    expect(branches[0].title).toBe('North')
  })

  it('offers no branch codes for a single-location store', () => {
    expect(buildQrCatalog(catalogInput({ isMultiBranch: false })).branches).toEqual([])
  })

  it('groups tables by branch, in natural label order, carrying the branch in the link', () => {
    const { tableGroups } = buildQrCatalog(catalogInput())
    expect(tableGroups.map((g) => g.name)).toEqual(['North', 'South'])
    expect(tableGroups[0].items.map((i) => i.url)).toEqual([
      `${BASE}/menu?table=2&outlet=north`,
      `${BASE}/menu?table=10&outlet=north`,
    ])
    expect(tableGroups[0].items[0].subtitle).toBe('North · Patio')
    expect(tableGroups[0].items[0].fileName).toBe('cafe-north-table-2-qr')
  })

  it('puts every table on one floor, without a branch, when multi-branch is off', () => {
    const { tableGroups } = buildQrCatalog(catalogInput({ isMultiBranch: false }))
    expect(tableGroups).toHaveLength(1)
    expect(tableGroups[0].items.every((i) => !i.url.includes('outlet='))).toBe(true)
    expect(tableGroups[0].items.map((i) => i.title)).toEqual(['Table 2', 'Table 10', 'Bar'])
  })

  it('adds typed tables to their branch and skips ones the floor plan already has', () => {
    const { tableGroups } = buildQrCatalog(
      catalogInput({ extraTables: [{ outletId: 'o2', labels: ['BAR', '1'] }] })
    )
    const south = tableGroups.find((g) => g.key === 'o2')!
    expect(south.items.map((i) => [i.title, i.isTyped])).toEqual([
      ['Table 1', true],
      ['Bar', false],
    ])
  })

  it('opens a group for a branch that only has typed tables', () => {
    const { tableGroups } = buildQrCatalog(
      catalogInput({ tables: [], extraTables: [{ outletId: 'o1', labels: ['1'] }] })
    )
    expect(tableGroups.map((g) => g.name)).toEqual(['North'])
  })

  it('ignores typed tables for a branch that does not exist', () => {
    const { tableGroups } = buildQrCatalog(catalogInput({ tables: [], extraTables: [{ outletId: 'nope', labels: ['1'] }] }))
    expect(tableGroups).toEqual([])
  })

  it('gives every code a unique id', () => {
    const catalog = buildQrCatalog(catalogInput({ extraTables: [{ outletId: 'o1', labels: ['5'] }] }))
    const ids = [catalog.store, ...catalog.branches, ...catalog.tableGroups.flatMap((g) => g.items)].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('tableTitle', () => {
  it('says "Table" before a number-like label and leaves names alone', () => {
    expect(tableTitle('12')).toBe('Table 12')
    expect(tableTitle('A3')).toBe('Table A3')
    expect(tableTitle('Patio 2')).toBe('Patio 2')
  })
})
