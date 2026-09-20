import { describe, it, expect } from '@jest/globals'
import { ALL_CURATED_ICONS, CURATED_ICON_GROUPS, isKnownCategoryIcon, isValidCategoryIconColor } from '@/lib/category-icon-catalog'
import { ICON_COMPONENT_MAP } from '@/lib/category-icons'

describe('category icon catalog', () => {
  it('every curated name has a component, and every component is curated', () => {
    const componentNames = Object.keys(ICON_COMPONENT_MAP).sort()
    expect([...ALL_CURATED_ICONS].sort()).toEqual(componentNames)
  })

  it('groups are non-empty and labelled', () => {
    for (const group of CURATED_ICON_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0)
      expect(group.icons.length).toBeGreaterThan(0)
    }
  })
})

describe('isKnownCategoryIcon', () => {
  it('accepts curated lucide names, emoji and empty', () => {
    expect(isKnownCategoryIcon('lucide:pizza')).toBe(true)
    expect(isKnownCategoryIcon('🍕')).toBe(true)
    expect(isKnownCategoryIcon('')).toBe(true)
    expect(isKnownCategoryIcon(undefined)).toBe(true)
  })

  it('rejects an unknown lucide name (it would render as nothing) and long junk', () => {
    expect(isKnownCategoryIcon('lucide:pizza-slice-deluxe')).toBe(false)
    expect(isKnownCategoryIcon('lucide:')).toBe(false)
    expect(isKnownCategoryIcon('this is not an icon')).toBe(false)
  })
})

describe('isValidCategoryIconColor', () => {
  it('accepts 6-digit hex or empty, rejects names and short hex', () => {
    expect(isValidCategoryIconColor('#FF6B00')).toBe(true)
    expect(isValidCategoryIconColor('')).toBe(true)
    expect(isValidCategoryIconColor(undefined)).toBe(true)
    expect(isValidCategoryIconColor('red')).toBe(false)
    expect(isValidCategoryIconColor('#FFF')).toBe(false)
  })
})
