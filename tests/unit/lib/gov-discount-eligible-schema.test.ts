import { describe, expect, it } from '@jest/globals'
import {
  categoryPatchSchema,
  categorySchema,
  menuItemSchema,
  menuItemUpdateSchema,
} from '@/lib/admin-service'

// Senior/PWD eligibility is item AND category, default true in the database.
// The schemas must carry an explicit choice and must NEVER invent one: a
// full-record save from an editor that does not send the field (Category
// Studio, an older client) would otherwise switch the discount back on for
// retail merchandise the owner had excluded.

const dish = {
  name: 'Tote bag',
  description: '',
  price: 350,
  category_id: '11111111-1111-4111-8111-111111111111',
}

const category = { name: 'Merchandise' }

describe('menu item Senior/PWD eligibility', () => {
  it('keeps an explicit "not covered"', () => {
    expect(menuItemSchema.parse({ ...dish, gov_discount_eligible: false }).gov_discount_eligible).toBe(false)
    expect(menuItemSchema.parse({ ...dish, gov_discount_eligible: true }).gov_discount_eligible).toBe(true)
  })

  it('leaves the column alone when a save does not mention it (the database default is ON)', () => {
    const parsed = menuItemSchema.parse(dish)

    expect(parsed.gov_discount_eligible).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(parsed, 'gov_discount_eligible')).toBe(false)
  })

  it('lets the MCP partial update flip it alone', () => {
    expect(menuItemUpdateSchema.parse({ gov_discount_eligible: false })).toEqual({ gov_discount_eligible: false })
    expect(menuItemUpdateSchema.parse({ price: 10 })).toEqual({ price: 10 })
  })

  it('refuses a value that is not a boolean', () => {
    expect(menuItemSchema.safeParse({ ...dish, gov_discount_eligible: 'no' }).success).toBe(false)
    expect(menuItemUpdateSchema.safeParse({ gov_discount_eligible: 0 }).success).toBe(false)
  })
})

describe('category Senior/PWD eligibility', () => {
  it('keeps an explicit choice on create and full update', () => {
    expect(categorySchema.parse({ ...category, gov_discount_eligible: false }).gov_discount_eligible).toBe(false)
  })

  it('does not reset it on a full-record save that omits it', () => {
    expect(categorySchema.parse(category).gov_discount_eligible).toBeUndefined()
  })

  it('accepts it on a partial category edit, and only then', () => {
    expect(categoryPatchSchema.parse({ gov_discount_eligible: false })).toEqual({ gov_discount_eligible: false })
    expect(categoryPatchSchema.parse({ name: 'Drinks' })).toEqual({ name: 'Drinks' })
  })
})
