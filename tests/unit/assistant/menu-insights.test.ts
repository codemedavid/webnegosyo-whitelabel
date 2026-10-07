import { selectMenuInsight } from '@/lib/assistant/insights/menu-insights'
import type { MenuPerformance } from '@/lib/queries/menu-performance-merge'
import type { MenuClassification } from '@/lib/menu-engineering-classify'

const NOW = Date.parse('2026-10-06T00:00:00Z')
const OLD = '2026-01-01T00:00:00Z'
const RECENT = '2026-10-01T00:00:00Z'

const MENU = [
  { id: 'a', name: 'Sisig', price: 180, isAvailable: true, categoryId: null, categoryName: null, createdAt: OLD },
  { id: 'b', name: 'Adobo', price: 150, isAvailable: true, categoryId: null, categoryName: null, createdAt: OLD },
  { id: 'c', name: 'Kare-kare', price: 320, isAvailable: true, categoryId: null, categoryName: null, createdAt: OLD },
  { id: 'd', name: 'New Halo-halo', price: 120, isAvailable: true, categoryId: null, categoryName: null, createdAt: RECENT },
  { id: 'e', name: 'Sold-out Lechon', price: 400, isAvailable: false, categoryId: null, categoryName: null, createdAt: OLD },
]

function performance(complete = true): MenuPerformance {
  return {
    dataSource: 'platform',
    windowDays: 30,
    totalUnits: 52,
    totalRevenue: 9000,
    items: [
      { itemId: 'a', name: 'Sisig', units: 40, revenue: 7200, unitShare: 0.77, revenueShare: 0.8 },
      { itemId: 'b', name: 'Adobo', units: 12, revenue: 1800, unitShare: 0.23, revenueShare: 0.2 },
    ],
    coverage: complete ? { complete: true } : { complete: false, note: 'Order database could not be reached.' },
  }
}

const base = { days: 30, menu: MENU, classification: null, now: NOW }

describe('selectMenuInsight', () => {
  test('top sellers rank by revenue', () => {
    const result = selectMenuInsight({ ...base, focus: 'top', performance: performance() })

    expect(result.rows.map((r) => r.name)).toEqual(['Sisig', 'Adobo'])
  })

  test('not selling lists on-sale dishes with zero sales, established ones first, never sold-out ones', () => {
    const result = selectMenuInsight({ ...base, focus: 'not_selling', performance: performance() })

    expect(result.rows.map((r) => r.name)).toEqual(['Kare-kare', 'New Halo-halo'])
    expect(result.rows[1].isNew).toBe(true)
  })

  test('refuses to call anything not-selling when the sales read was incomplete', () => {
    const result = selectMenuInsight({ ...base, focus: 'not_selling', performance: performance(false) })

    expect(result.rows).toEqual([])
    expect(result.note).toMatch(/can't tell/i)
  })

  test('slow movers are dishes that sold, least first', () => {
    const result = selectMenuInsight({ ...base, focus: 'slow', performance: performance() })

    expect(result.rows.map((r) => r.name)).toEqual(['Adobo', 'Sisig'])
  })

  test('hidden gems are under-ordered puzzles, highest margin first', () => {
    const classification = {
      marginBasis: 'price_proxy',
      canApply: true,
      warnings: [],
      items: [
        { itemId: 'b', name: 'Adobo', classification: 'puzzle', contributionMargin: 150 },
        { itemId: 'c', name: 'Kare-kare', classification: 'puzzle', contributionMargin: 320 },
        { itemId: 'a', name: 'Sisig', classification: 'star', contributionMargin: 180 },
      ],
    } as unknown as MenuClassification

    const result = selectMenuInsight({ ...base, focus: 'hidden_gems', performance: performance(), classification })

    expect(result.rows.map((r) => r.name)).toEqual(['Kare-kare', 'Adobo'])
  })

  test('hidden gems explain themselves when the evidence is too thin', () => {
    const classification = { marginBasis: 'price_proxy', canApply: false, warnings: ['Only 12 units sold.'], items: [] } as unknown as MenuClassification

    const result = selectMenuInsight({ ...base, focus: 'hidden_gems', performance: performance(), classification })

    expect(result.rows).toEqual([])
    expect(result.note).toBe('Only 12 units sold.')
  })
})
