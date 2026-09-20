import { describe, it, expect } from '@jest/globals'
import { categoryPatchSchema, categorySchema } from '@/lib/admin-service'

describe('categorySchema icon validation', () => {
  it('accepts curated lucide icons, emoji, and hex colours', () => {
    expect(() => categorySchema.parse({ name: 'Pizza', icon: 'lucide:pizza', icon_color: '#E63946' })).not.toThrow()
    expect(() => categorySchema.parse({ name: 'Ramen', icon: '🍜' })).not.toThrow()
  })

  it('rejects an icon the storefront cannot render, and a non-hex colour', () => {
    expect(() => categorySchema.parse({ name: 'Pizza', icon: 'lucide:pizza-deluxe' })).toThrow(/list_category_icons/)
    expect(() => categorySchema.parse({ name: 'Pizza', icon_color: 'red' })).toThrow(/hex/)
  })
})

describe('categoryPatchSchema', () => {
  it('applies no defaults so a lone icon edit leaves order/active/layout untouched', () => {
    expect(categoryPatchSchema.parse({ icon: 'lucide:coffee' })).toEqual({ icon: 'lucide:coffee' })
  })
})
