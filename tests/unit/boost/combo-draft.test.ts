import {
  comboDraftFromBundle,
  comboDraftFromIdea,
  comboDraftPrice,
  comboDraftRegularPrice,
  comboDraftToInput,
  emptyComboDraft,
  type ComboDraftItem,
} from '@/lib/boost/combo-draft'
import type { BundleWithSlots } from '@/types/database'

const ITEMS: ComboDraftItem[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Burger', price: 99, categoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', categoryName: 'Burgers', role: 'main' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Fries', price: 45, categoryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', categoryName: 'Sides', role: 'side' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Coke', price: 30, categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', categoryName: 'Drinks', role: 'drink' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Iced Tea', price: 39, categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', categoryName: 'Drinks', role: 'drink' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Mystery', price: 10, categoryId: null, categoryName: null, role: 'other' },
]
const byId = new Map(ITEMS.map((i) => [i.id, i]))
const [BURGER, FRIES, COKE, TEA, ORPHAN] = ITEMS.map((i) => i.id)

describe('combo draft pricing', () => {
  it('prices each pick at its cheapest choice', () => {
    const draft = {
      ...emptyComboDraft(),
      picks: [
        { key: 'a', label: 'Burger', itemIds: [BURGER], count: 1, surcharges: {} },
        { key: 'b', label: 'Drink', itemIds: [TEA, COKE], count: 2, surcharges: {} },
      ],
    }
    expect(comboDraftRegularPrice(draft, byId)).toBe(99 + 30 * 2)
  })

  it('reads the customer price from either pricing mode', () => {
    const base = {
      ...emptyComboDraft(),
      picks: [{ key: 'a', label: 'Burger', itemIds: [BURGER, FRIES], count: 1, surcharges: {} }],
    }
    expect(comboDraftPrice({ ...base, priceMode: 'fixed', price: '40' }, byId)).toBe(40)
    expect(comboDraftPrice({ ...base, priceMode: 'percent', percent: '20' }, byId)).toBe(36)
    expect(comboDraftPrice({ ...base, priceMode: 'fixed', price: '' }, byId)).toBeNull()
  })
})

describe('comboDraftToInput', () => {
  it('turns picks into slots named for the customer', () => {
    const draft = {
      ...emptyComboDraft(),
      name: 'Burger Meal',
      price: '119',
      picks: [
        { key: 'a', label: 'Burger', itemIds: [BURGER], count: 1, surcharges: {} },
        { key: 'b', label: 'Drink', itemIds: [COKE, TEA], count: 1, surcharges: { [TEA]: 10 } },
      ],
    }
    const result = comboDraftToInput(draft, byId)
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    expect(result.input).toMatchObject({
      name: 'Burger Meal',
      pricing_type: 'fixed',
      fixed_price: 119,
      discount_percent: null,
      show_on_menu: true,
      show_as_upsell: true,
    })
    expect(result.input.slots).toEqual([
      expect.objectContaining({ name: 'Burger', category_id: ITEMS[0].categoryId, pick_count: 1, sort_order: 0, included_item_ids: [BURGER], price_overrides: [] }),
      expect.objectContaining({ name: 'Drink', category_id: ITEMS[2].categoryId, included_item_ids: [COKE, TEA], price_overrides: [{ menu_item_id: TEA, price_override: 10 }] }),
    ])
  })

  it('explains every problem in plain words', () => {
    const result = comboDraftToInput({ ...emptyComboDraft(), name: 'X', price: '' }, byId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.name).toMatch(/name/i)
    expect(result.errors.picks).toMatch(/add/i)
    expect(result.errors.price).toMatch(/price/i)
  })

  it('refuses a combo priced above what it replaces', () => {
    const result = comboDraftToInput({
      ...emptyComboDraft(),
      name: 'Pricey',
      price: '500',
      picks: [{ key: 'a', label: 'Burger', itemIds: [BURGER], count: 1, surcharges: {} }],
    }, byId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.price).toMatch(/more than/i)
  })

  it('names the item that has no category instead of failing silently', () => {
    const result = comboDraftToInput({
      ...emptyComboDraft(),
      name: 'Odd',
      price: '5',
      picks: [{ key: 'a', label: 'Mystery', itemIds: [ORPHAN], count: 1, surcharges: {} }],
    }, byId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.picks).toContain('Mystery')
  })
})

describe('combo drafts from existing data', () => {
  it('round-trips a saved bundle', () => {
    const bundle = {
      id: 'b1', tenant_id: 't', name: 'Burger Meal', description: 'Classic', image_url: '',
      pricing_type: 'discount', fixed_price: null, discount_percent: 15, is_active: false,
      show_on_menu: true, show_as_upsell: false, display_order: 0, created_at: '', updated_at: '',
      slots: [
        { id: 's1', bundle_id: 'b1', name: 'Main', category_id: 'c', pick_count: 1, sort_order: 0, included_item_ids: [BURGER], created_at: '', price_overrides: [] },
        { id: 's2', bundle_id: 'b1', name: 'Drink', category_id: 'c', pick_count: 1, sort_order: 1, included_item_ids: [COKE, TEA], created_at: '',
          price_overrides: [{ id: 'p', slot_id: 's2', menu_item_id: TEA, price_override: 10, created_at: '' }] },
      ],
    } as unknown as BundleWithSlots
    const draft = comboDraftFromBundle(bundle, ITEMS)
    expect(draft).toMatchObject({ name: 'Burger Meal', priceMode: 'percent', percent: '15', isActive: false, showAsSuggestion: false })
    expect(draft.picks.map((p) => [p.label, p.itemIds, p.surcharges])).toEqual([
      ['Main', [BURGER], {}],
      ['Drink', [COKE, TEA], { [TEA]: 10 }],
    ])
  })

  it('expands a category-only slot into that category’s items', () => {
    const bundle = {
      id: 'b2', name: 'Any Drink', pricing_type: 'fixed', fixed_price: 25, is_active: true, show_on_menu: true, show_as_upsell: true,
      slots: [{ id: 's', name: 'Drink', category_id: ITEMS[2].categoryId, pick_count: 1, sort_order: 0, included_item_ids: null, price_overrides: [] }],
    } as unknown as BundleWithSlots
    expect(comboDraftFromBundle(bundle, ITEMS).picks[0].itemIds.sort()).toEqual([COKE, TEA].sort())
  })

  it('starts from an idea with its suggested price', () => {
    const draft = comboDraftFromIdea({
      kind: 'combo', id: 'combo:x', title: 'Burger Meal', reason: '', itemIds: [BURGER, FRIES],
      name: 'Burger Meal', regularPrice: 144, price: 129, savings: { amount: 15, percent: 10 },
      picks: [{ label: 'Burger', itemIds: [BURGER] }, { label: 'Side', itemIds: [FRIES] }],
    })
    expect(draft).toMatchObject({ name: 'Burger Meal', priceMode: 'fixed', price: '129', isActive: true })
    expect(draft.picks.map((p) => p.itemIds)).toEqual([[BURGER], [FRIES]])
  })
})
