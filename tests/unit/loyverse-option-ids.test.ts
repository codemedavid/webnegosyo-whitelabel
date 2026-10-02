import {
  modifierGroupId,
  modifierOptionId,
  parseModifierOptionId,
  parseVariantOptionId,
  variantGroupId,
  variantOptionId,
} from '@/lib/loyverse/option-ids'

describe('Loyverse option ids', () => {
  it('round-trips variant and modifier option ids', () => {
    expect(parseVariantOptionId(variantOptionId('v1'))).toBe('v1')
    expect(parseModifierOptionId(modifierOptionId('m1'))).toBe('m1')
  })

  it('never reads a group id as an option', () => {
    expect(parseVariantOptionId(variantGroupId('item1'))).toBeNull()
    expect(parseModifierOptionId(modifierGroupId('mod1'))).toBeNull()
  })

  it('keeps the two kinds apart', () => {
    expect(parseVariantOptionId(modifierOptionId('m1'))).toBeNull()
    expect(parseModifierOptionId(variantOptionId('v1'))).toBeNull()
  })

  it('pins the load-bearing prefixes orders and the merchant app depend on', () => {
    expect(variantOptionId('x')).toBe('lv-x')
    expect(modifierOptionId('x')).toBe('lvm-x')
  })
})
