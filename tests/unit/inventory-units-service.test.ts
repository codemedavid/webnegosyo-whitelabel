import { describe, it, expect } from '@jest/globals'
import { unitInputSchema } from '@/lib/inventory/units-service'

describe('unitInputSchema', () => {
  it('accepts a minimal valid unit and defaults is_base/is_active', () => {
    const parsed = unitInputSchema.parse({
      name: 'Kilogram',
      abbreviation: 'kg',
      dimension: 'weight',
      to_base_factor: 1000,
    })

    expect(parsed.name).toBe('Kilogram')
    expect(parsed.abbreviation).toBe('kg')
    expect(parsed.dimension).toBe('weight')
    expect(parsed.to_base_factor).toBe(1000)
    expect(parsed.is_base).toBe(false)
    expect(parsed.is_active).toBe(true)
  })

  it('trims whitespace from name and abbreviation', () => {
    const parsed = unitInputSchema.parse({
      name: '  Gram  ',
      abbreviation: '  g  ',
      dimension: 'weight',
      to_base_factor: 1,
    })
    expect(parsed.name).toBe('Gram')
    expect(parsed.abbreviation).toBe('g')
  })

  it('rejects an empty name', () => {
    expect(() =>
      unitInputSchema.parse({ name: '', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }),
    ).toThrow()
  })

  it('rejects an empty abbreviation', () => {
    expect(() =>
      unitInputSchema.parse({ name: 'Gram', abbreviation: '', dimension: 'weight', to_base_factor: 1 }),
    ).toThrow()
  })

  it('rejects an unknown dimension', () => {
    expect(() =>
      unitInputSchema.parse({ name: 'Bad', abbreviation: 'x', dimension: 'length', to_base_factor: 1 }),
    ).toThrow()
  })

  it('rejects a zero or negative to_base_factor', () => {
    expect(() =>
      unitInputSchema.parse({ name: 'Zero', abbreviation: 'z', dimension: 'count', to_base_factor: 0 }),
    ).toThrow()
    expect(() =>
      unitInputSchema.parse({ name: 'Neg', abbreviation: 'n', dimension: 'count', to_base_factor: -5 }),
    ).toThrow()
  })

  it('accepts an explicit base unit', () => {
    const parsed = unitInputSchema.parse({
      name: 'Piece',
      abbreviation: 'pc',
      dimension: 'count',
      to_base_factor: 1,
      is_base: true,
    })
    expect(parsed.is_base).toBe(true)
  })
})
