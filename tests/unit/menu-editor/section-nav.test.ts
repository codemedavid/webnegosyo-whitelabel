import { buildSectionNav } from '@/lib/menu-editor/section-nav'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'

const base = {
  missingDetailCount: 0,
  isAvailable: true,
  hasUnifiedOptions: false,
  choiceStatus: undefined,
  addonCount: 0,
  optionGroupCount: 0,
  isPriceMissing: false,
}

describe('buildSectionNav', () => {
  it('lists details, pricing, status, sizes & choices, add-ons and more options in page order', () => {
    const entries = buildSectionNav(base)
    expect(entries.map((e) => e.id)).toEqual([
      DISH_SECTION_IDS.details,
      DISH_SECTION_IDS.pricing,
      DISH_SECTION_IDS.availability,
      DISH_SECTION_IDS.choices,
      DISH_SECTION_IDS.addons,
      DISH_SECTION_IDS.more,
    ])
  })

  it('flags a missing price on the pricing entry, not on details', () => {
    const entries = buildSectionNav({ ...base, isPriceMissing: true })
    expect(entries[0].status).toBeUndefined()
    expect(entries[1]).toMatchObject({ status: 'Needs a price', isAttention: true })
  })

  it('flags details that still need filling in', () => {
    const [details] = buildSectionNav({ ...base, missingDetailCount: 2 })
    expect(details).toMatchObject({ status: '2 to fill', isAttention: true })
  })

  it('flags an out-of-stock dish', () => {
    const [, , availability] = buildSectionNav({ ...base, isAvailable: false })
    expect(availability).toMatchObject({ status: 'Out of stock', isAttention: true })
  })

  it('shows counts for choices and add-ons', () => {
    const entries = buildSectionNav({ ...base, choiceStatus: '3 sizes', addonCount: 2 })
    expect(entries[3].status).toBe('3 sizes')
    expect(entries[4].status).toBe('2')
  })

  it('uses one "Sizes & add-ons" entry for the unified option editor', () => {
    const entries = buildSectionNav({ ...base, hasUnifiedOptions: true, optionGroupCount: 4 })
    expect(entries.map((e) => e.label)).toEqual(['Details', 'Pricing', 'Status', 'Options', 'More'])
    expect(entries[3]).toMatchObject({ id: DISH_SECTION_IDS.choices, status: '4' })
  })
})
