import { describe, it, expect } from '@jest/globals'
import { bundleFieldsPatchSchema, toBundleRow } from '@/lib/bundles-service'

describe('toBundleRow', () => {
  it('maps only the fields present', () => {
    expect(toBundleRow({ name: 'X', is_active: false })).toEqual({ name: 'X', is_active: false })
    expect(toBundleRow({})).toEqual({})
  })

  it('nulls the pricing column that does not belong to the chosen type', () => {
    expect(toBundleRow({ pricing_type: 'fixed', fixed_price: 199, discount_percent: 20 })).toEqual({ pricing_type: 'fixed', fixed_price: 199, discount_percent: null })
    expect(toBundleRow({ pricing_type: 'discount', discount_percent: 20 })).toEqual({ pricing_type: 'discount', fixed_price: null, discount_percent: 20 })
  })

  it('passes a lone price through when the type is not being changed', () => {
    expect(toBundleRow({ fixed_price: 250 })).toEqual({ fixed_price: 250 })
  })
})

describe('bundleFieldsPatchSchema', () => {
  it('has no defaults, so a partial patch cannot reset visibility flags', () => {
    expect(bundleFieldsPatchSchema.parse({ name: 'Only name' })).toEqual({ name: 'Only name' })
  })

  it('does not accept slots', () => {
    expect(bundleFieldsPatchSchema.parse({ slots: [] })).toEqual({})
  })
})
