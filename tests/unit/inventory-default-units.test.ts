import {
  DEFAULT_UNITS,
  buildDefaultUnitInserts,
} from '@/lib/inventory/default-units'
import { convertQuantity } from '@/lib/inventory/unit-conversion'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

describe('DEFAULT_UNITS catalog', () => {
  test('covers all three dimensions with exactly one base unit each', () => {
    for (const dim of ['weight', 'volume', 'count'] as const) {
      const inDim = DEFAULT_UNITS.filter((u) => u.dimension === dim)
      expect(inDim.length).toBeGreaterThan(0)
      const bases = inDim.filter((u) => u.is_base)
      expect(bases).toHaveLength(1)
      // The base unit's factor is exactly 1.
      expect(bases[0].to_base_factor).toBe(1)
    }
  })

  test('every unit has a positive conversion factor and unique abbreviation', () => {
    const seen = new Set<string>()
    for (const u of DEFAULT_UNITS) {
      expect(u.to_base_factor).toBeGreaterThan(0)
      const key = u.abbreviation.toLowerCase()
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  test('kilogram and gram convert correctly through the catalog factors', () => {
    const kg = DEFAULT_UNITS.find((u) => u.abbreviation === 'kg')!
    const g = DEFAULT_UNITS.find((u) => u.abbreviation === 'g')!
    const asUnit = (u: typeof kg): InventoryUnit => ({
      id: u.abbreviation,
      name: u.name,
      abbreviation: u.abbreviation,
      dimension: u.dimension,
      to_base_factor: u.to_base_factor,
    })
    // 2 kg → 2000 g
    expect(convertQuantity(2, asUnit(kg), asUnit(g))).toBeCloseTo(2000, 6)
  })

  test('liter converts to millilitre by 1000', () => {
    const l = DEFAULT_UNITS.find((u) => u.abbreviation === 'L')!
    const ml = DEFAULT_UNITS.find((u) => u.abbreviation === 'ml')!
    expect(l.to_base_factor / ml.to_base_factor).toBeCloseTo(1000, 6)
  })
})

describe('buildDefaultUnitInserts', () => {
  test('stamps every row with the tenant id and preserves catalog fields', () => {
    const rows = buildDefaultUnitInserts('tenant-123')
    expect(rows).toHaveLength(DEFAULT_UNITS.length)
    for (const row of rows) {
      expect(row.tenant_id).toBe('tenant-123')
      expect(typeof row.name).toBe('string')
      expect(row.to_base_factor).toBeGreaterThan(0)
    }
    // A known unit survives the mapping.
    const gram = rows.find((r) => r.abbreviation === 'g')
    expect(gram).toMatchObject({ dimension: 'weight', is_base: true, to_base_factor: 1 })
  })
})
