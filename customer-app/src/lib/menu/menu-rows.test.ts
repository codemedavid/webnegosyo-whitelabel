import { VALID_CATALOG } from '@/fixtures/contract-fixtures'
import type { AppCatalog } from '@/lib/contract'
import { buildMenuRows } from './menu-rows'

const catalog = VALID_CATALOG as unknown as AppCatalog

describe('buildMenuRows', () => {
  it('interleaves a header before each category that has items, and records header positions', () => {
    const { rows, headerIndices, sections } = buildMenuRows(catalog.categories, catalog.items, '')
    expect(rows[0]).toMatchObject({ type: 'header', category: { id: 'cat-espresso' } })
    expect(headerIndices).toEqual([0, 4, 7])
    expect(sections.map((category) => category.id)).toEqual(['cat-espresso', 'cat-cold', 'cat-pastry'])
    expect(rows).toHaveLength(10)
  })

  it('skips categories with no items', () => {
    const categories = [...catalog.categories, { id: 'empty', name: 'Empty', description: null, imageUrl: null }]
    expect(buildMenuRows(categories, catalog.items, '').sections.map((category) => category.id)).not.toContain('empty')
  })

  it('searches names and descriptions, case- and accent-insensitively', () => {
    const { rows } = buildMenuRows(catalog.categories, catalog.items, 'caffe')
    expect(rows.filter((row) => row.type === 'item').map((row) => row.type === 'item' && row.item.id)).toEqual(['item-latte'])
    const byDescription = buildMenuRows(catalog.categories, catalog.items, 'CHOCOLATEY')
    expect(byDescription.rows.some((row) => row.type === 'item' && row.item.id === 'item-cold-brew')).toBe(true)
  })

  it('returns nothing for a search with no match', () => {
    expect(buildMenuRows(catalog.categories, catalog.items, 'pizza').rows).toEqual([])
  })
})
