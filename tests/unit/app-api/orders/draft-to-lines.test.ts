import { projectAppCatalog } from '@/lib/app-api/project-catalog'
import { draftToOrderLines, linkedItemIdsForDraft, type DraftLinesInput } from '@/lib/app-api/orders/draft-to-lines'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { priceLineModifiers } from '@/lib/order-line-modifier-pricing'
import { buildOutletMenuIndex, type OutletMenuOverrideRow } from '@/lib/outlets/outlet-menu-overrides'
import type { Category, MenuItem, ModifierGroup } from '@/types/database'
import {
  createTestAddon,
  createTestMenuItem,
  createTestVariation,
  createTestVariationOption,
  createTestVariationType,
} from '../../../fixtures/menu-item.fixture'

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  tenant_id: 't',
  name: 'Coffee',
  order: 0,
  is_active: true,
  display_layout: 'grid',
  created_at: '',
  updated_at: '',
  ...overrides,
})

const size: ModifierGroup = {
  id: 'size',
  name: 'Size',
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [
    { id: 'tall', name: 'Tall', price_modifier: 0, display_order: 0 },
    { id: 'grande', name: 'Grande', price_modifier: 30, display_order: 1 },
    { id: 'venti', name: 'Venti', price_modifier: 50, display_order: 2, is_available: false },
  ],
}

const sauces: ModifierGroup = {
  id: 'sauces',
  name: 'Sauces',
  display_order: 1,
  min_select: 0,
  max_select: 2,
  options: [
    { id: 'caramel', name: 'Caramel', price_modifier: 15, display_order: 0 },
    { id: 'mocha', name: 'Mocha', price_modifier: 15, display_order: 1 },
    { id: 'hazelnut', name: 'Hazelnut', price_modifier: 15, display_order: 2 },
  ],
}

const shots: ModifierGroup = {
  id: 'shots',
  name: 'Extra shots',
  selection_mode: 'quantity',
  display_order: 2,
  min_select: 0,
  max_select: 4,
  options: [{ id: 'shot', name: 'Espresso shot', price_modifier: 35, display_order: 0 }],
}

const latte = createTestMenuItem({ id: 'latte', category_id: 'cat-1', name: 'Latte', price: 150, modifier_groups: [size, sauces, shots] })

const input = (overrides: Partial<DraftLinesInput> & { items?: MenuItem[] } = {}): DraftLinesInput => {
  const { items = [latte], ...rest } = overrides
  return {
    lines: [{ itemId: 'latte', quantity: 1, selections: { size: { tall: 1 } } }],
    menuItems: new Map(items.map((item) => [item.id, item])),
    categories: [category()],
    tenant: { modifier_groups_enabled: true },
    branchIndex: buildOutletMenuIndex([]),
    outletId: null,
    ...rest,
  }
}

const expectLines = (draft: DraftLinesInput) => {
  const result = draftToOrderLines(draft)
  if (!result.ok) throw new Error(result.error)
  return result.lines
}

const expectRefusal = (draft: DraftLinesInput): string => {
  const result = draftToOrderLines(draft)
  if (result.ok) throw new Error('expected a refusal')
  return result.error
}

describe('draftToOrderLines — unified modifier groups (flag on)', () => {
  it('builds the line the web checkout builds: variation from single choice, add-ons from the rest', () => {
    const [line] = expectLines(
      input({ lines: [{ itemId: 'latte', quantity: 2, selections: { size: { grande: 1 }, sauces: { mocha: 1, caramel: 1 }, shots: { shot: 2 } } }] }),
    )
    expect(line).toEqual({
      menu_item_id: 'latte',
      menu_item_name: 'Latte',
      variation: 'Grande',
      // Group order, then the group's own option order — whatever order the app sent.
      addons: ['Caramel', 'Mocha', 'Espresso shot ×2'],
      quantity: 2,
      price: 0,
      subtotal: 0,
      option_ids: ['grande'],
      addon_ids: ['caramel', 'mocha', 'shot'],
      addon_quantities: { shot: 2 },
    })
    expect(parseOrderLines([line]).ok).toBe(true)
  })

  it('leaves out variation and addon_quantities when there is nothing to say', () => {
    const [line] = expectLines(input({ lines: [{ itemId: 'latte', quantity: 1, selections: { size: { tall: 1 }, shots: { shot: 1 } } }] }))
    expect(line.variation).toBe('Tall')
    expect(line.addons).toEqual(['Espresso shot'])
    expect(line).not.toHaveProperty('addon_quantities')
  })

  it('reprices to the menu: the delta the server computes is the options picked', () => {
    const [line] = expectLines(input({ lines: [{ itemId: 'latte', quantity: 1, selections: { size: { grande: 1 }, shots: { shot: 3 } } }] }))
    expect(priceLineModifiers(line, latte, new Map()).delta).toBe(30 + 3 * 35)
  })

  it('refuses a missing required group, a group over its cap and a choice counted twice', () => {
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: {} }] }))).toBe('Choose an option for Size on Latte.')
    const tooMany = { size: { tall: 1 }, sauces: { caramel: 1, mocha: 1, hazelnut: 1 } }
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: tooMany }] }))).toBe('Choose at most 2 for Sauces on Latte.')
    const twice = { size: { tall: 1 }, sauces: { caramel: 2 } }
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: twice }] }))).toBe('Choose Caramel only once for Latte.')
    const portions = { size: { tall: 1 }, shots: { shot: 5 } }
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: portions }] }))).toBe('Choose at most 4 for Extra shots on Latte.')
  })

  it('enforces a minimum above one, counted in portions for quantity groups', () => {
    const atLeastTwo = createTestMenuItem({ id: 'latte', category_id: 'cat-1', name: 'Latte', modifier_groups: [{ ...shots, min_select: 2 }] })
    expect(expectRefusal(input({ items: [atLeastTwo], lines: [{ itemId: 'latte', quantity: 1, selections: { shots: { shot: 1 } } }] }))).toBe(
      'Choose at least 2 for Extra shots on Latte.',
    )
    expect(expectLines(input({ items: [atLeastTwo], lines: [{ itemId: 'latte', quantity: 1, selections: { shots: { shot: 2 } } }] }))).toHaveLength(1)
  })

  it('refuses an unknown group, an unknown option and a sold-out option, naming the dish', () => {
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: { size: { tall: 1 }, milk: { oat: 1 } } }] }))).toMatch(/Latte/)
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: { size: { trenta: 1 } } }] }))).toMatch(/choices for Latte/)
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 1, selections: { size: { venti: 1 } } }] }))).toBe('Venti for Latte is sold out right now.')
  })

  it('refuses more simple-stock portions than the shelf holds across the whole line', () => {
    const counted = { ...shots, options: [{ ...shots.options[0], stock_mode: 'simple' as const, stock_qty: 3 }] }
    const item = createTestMenuItem({ id: 'latte', category_id: 'cat-1', name: 'Latte', modifier_groups: [counted] })
    expect(expectRefusal(input({ items: [item], lines: [{ itemId: 'latte', quantity: 2, selections: { shots: { shot: 2 } } }] }))).toBe(
      'Not enough Espresso shot left for Latte.',
    )
  })

  it('ignores modifier_groups when the store has the feature off, as the web does', () => {
    const both = createTestMenuItem({
      ...latte,
      variations: [createTestVariation({ id: 'reg', name: 'Regular', price_modifier: 0 })],
    })
    const off = input({ items: [both], tenant: {}, lines: [{ itemId: 'latte', quantity: 1, selections: { 'legacy-variations': { reg: 1 } } }] })
    expect(expectLines(off)[0]).toMatchObject({ variation: 'Regular', option_ids: ['reg'], addon_ids: [] })
    expect(expectRefusal({ ...off, lines: [{ itemId: 'latte', quantity: 1, selections: { size: { tall: 1 } } }] })).toMatch(/Latte/)
  })
})

describe('draftToOrderLines — legacy columns', () => {
  it('variation_types: each type is a single choice, names joined with ", "', () => {
    const item = createTestMenuItem({
      id: 'tea',
      category_id: 'cat-1',
      name: 'Milk Tea',
      variation_types: [
        createTestVariationType({
          id: 'size',
          name: 'Size',
          display_order: 0,
          options: [createTestVariationOption({ id: 'm', name: 'Medium', price_modifier: 0 }), createTestVariationOption({ id: 'l', name: 'Large', price_modifier: 20, display_order: 1 })],
        }),
        createTestVariationType({
          id: 'sugar',
          name: 'Sugar',
          is_required: false,
          display_order: 1,
          options: [createTestVariationOption({ id: 's50', name: '50%', price_modifier: 0 })],
        }),
      ],
    })
    const [line] = expectLines(input({ items: [item], tenant: {}, lines: [{ itemId: 'tea', quantity: 1, selections: { size: { l: 1 }, sugar: { s50: 1 } } }] }))
    expect(line).toMatchObject({ variation: 'Large, 50%', option_ids: ['l', 's50'], addon_ids: [], addons: [] })
    expect(priceLineModifiers(line, item, new Map()).delta).toBe(20)
    expect(expectRefusal(input({ items: [item], tenant: {}, lines: [{ itemId: 'tea', quantity: 1, selections: { sugar: { s50: 1 } } }] }))).toBe(
      'Choose an option for Size on Milk Tea.',
    )
  })

  it('flat variations + add-ons with portions: legacy-variations / legacy-addons ids', () => {
    const item = createTestMenuItem({
      id: 'burger',
      category_id: 'cat-1',
      name: 'Burger',
      variations: [createTestVariation({ id: 'single', name: 'Single', price_modifier: 0 }), createTestVariation({ id: 'double', name: 'Double', price_modifier: 60 })],
      addons: [createTestAddon({ id: 'cheese', name: 'Cheese', price: 15 }), createTestAddon({ id: 'bacon', name: 'Bacon', price: 30 })],
    })
    const selections = { 'legacy-variations': { double: 1 }, 'legacy-addons': { bacon: 1, cheese: 3 } }
    const [line] = expectLines(input({ items: [item], tenant: {}, lines: [{ itemId: 'burger', quantity: 1, selections }] }))
    expect(line).toMatchObject({
      variation: 'Double',
      option_ids: ['double'],
      addons: ['Cheese ×3', 'Bacon'],
      addon_ids: ['cheese', 'bacon'],
      addon_quantities: { cheese: 3 },
    })
    expect(priceLineModifiers(line, item, new Map()).delta).toBe(60 + 45 + 30)
    // Flat variations are optional (min 0): nothing picked is a plain burger.
    expect(expectLines(input({ items: [item], tenant: {}, lines: [{ itemId: 'burger', quantity: 1, selections: {} }] }))[0].variation).toBeUndefined()
  })

  it("offers the category's default add-ons, the dish's own winning a name clash", () => {
    const item = createTestMenuItem({ id: 'fries', category_id: 'cat-1', name: 'Fries', addons: [createTestAddon({ id: 'own-dip', name: 'Cheese dip', price: 20 })] })
    const defaults = [createTestAddon({ id: 'cat-dip', name: 'cheese DIP', price: 10 }), createTestAddon({ id: 'gravy', name: 'Gravy', price: 15 })]
    const draft = input({ items: [item], tenant: {}, categories: [category({ default_addons: defaults })] })
    const [line] = expectLines({ ...draft, lines: [{ itemId: 'fries', quantity: 1, selections: { 'legacy-addons': { gravy: 1, 'own-dip': 1 } } }] })
    expect(line).toMatchObject({ addons: ['Cheese dip', 'Gravy'], addon_ids: ['own-dip', 'gravy'] })
    expect(expectRefusal({ ...draft, lines: [{ itemId: 'fries', quantity: 1, selections: { 'legacy-addons': { 'cat-dip': 1 } } }] })).toMatch(/Fries/)
  })
})

describe('draftToOrderLines — linked options', () => {
  const coke = createTestMenuItem({ id: 'coke', category_id: 'cat-1', name: 'Coke', price: 60, discounted_price: 50 })
  const drinks: ModifierGroup = {
    id: 'drink',
    name: 'Add a drink',
    display_order: 0,
    min_select: 0,
    max_select: 1,
    options: [{ id: 'opt-coke', name: '', price_modifier: 0, menu_item_id: 'coke', display_order: 0 }],
  }
  const meal = createTestMenuItem({ id: 'meal', category_id: 'cat-1', name: 'Chicken meal', modifier_groups: [drinks] })

  it("labels the option with the linked dish's name and lists the ids to load", () => {
    expect(linkedItemIdsForDraft([meal], [category()], { modifier_groups_enabled: true })).toEqual(['coke'])
    const [line] = expectLines(input({ items: [meal, coke], lines: [{ itemId: 'meal', quantity: 1, selections: { drink: { 'opt-coke': 1 } } }] }))
    expect(line).toMatchObject({ variation: 'Coke', option_ids: ['opt-coke'] })
    expect(priceLineModifiers(line, meal, new Map([[coke.id, coke]])).delta).toBe(50)
  })

  it('refuses a link whose dish is gone, sold out, or unlisted at the branch', () => {
    const pick = [{ itemId: 'meal', quantity: 1, selections: { drink: { 'opt-coke': 1 } } }]
    expect(expectRefusal(input({ items: [meal], lines: pick }))).toBe('Unavailable item for Chicken meal is sold out right now.')
    expect(expectRefusal(input({ items: [meal, { ...coke, is_available: false }], lines: pick }))).toBe('Coke for Chicken meal is sold out right now.')
    const unlisted = buildOutletMenuIndex([override({ menu_item_id: 'coke', is_listed: false })])
    expect(expectRefusal(input({ items: [meal, coke], lines: pick, branchIndex: unlisted, outletId: 'b1' }))).toMatch(/sold out/)
  })
})

function override(overrides: Partial<OutletMenuOverrideRow>): OutletMenuOverrideRow {
  return {
    outlet_id: 'b1',
    menu_item_id: 'latte',
    is_listed: true,
    is_available: true,
    price: null,
    discounted_price: null,
    discount_cleared: false,
    ...overrides,
  }
}

describe('draftToOrderLines — the dish itself', () => {
  it('refuses a dish not on the store menu or in an inactive category', () => {
    expect(expectRefusal(input({ lines: [{ itemId: 'ghost', quantity: 1, selections: {} }] }))).toMatch(/no longer on the menu/)
    expect(expectRefusal(input({ categories: [category({ is_active: false })] }))).toMatch(/no longer on the menu/)
  })

  it('refuses a sold-out dish, a presell dish and a bad quantity', () => {
    expect(expectRefusal(input({ items: [{ ...latte, is_available: false }] }))).toBe('Latte is sold out right now.')
    expect(expectRefusal(input({ items: [{ ...latte, presell_enabled: true }] }))).toMatch(/Latte needs a pickup date/)
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 100, selections: { size: { tall: 1 } } }] }))).toMatch(/1 to 99/)
    expect(expectRefusal(input({ lines: [{ itemId: 'latte', quantity: 0, selections: { size: { tall: 1 } } }] }))).toMatch(/1 to 99/)
  })

  it('applies the branch: unlisted and branch-sold-out dishes are refused, others pass', () => {
    const unlisted = buildOutletMenuIndex([override({ is_listed: false })])
    expect(expectRefusal(input({ branchIndex: unlisted, outletId: 'b1' }))).toBe('Latte is not offered at the branch you picked.')
    const soldOut = buildOutletMenuIndex([override({ is_available: false })])
    expect(expectRefusal(input({ branchIndex: soldOut, outletId: 'b1' }))).toBe('Latte is sold out right now.')
    // Another branch's opinion is not this branch's.
    expect(expectLines(input({ branchIndex: unlisted, outletId: 'b2' }))).toHaveLength(1)
  })

  it('agrees with the catalog: every id the catalog shows is an id the translator accepts', () => {
    const catalog = projectAppCatalog({
      tenant: { modifier_groups_enabled: true },
      categories: [category()],
      menuItems: [latte],
      orderTypes: [],
      outlets: [],
      outletOverrides: [],
      outletId: null,
      paymentMethods: [],
      pairs: [],
    })
    const groups = catalog.items[0].modifierGroups
    const selections = Object.fromEntries(groups.map((group) => [group.id, { [group.options[0].id]: 1 }]))
    expect(expectLines(input({ lines: [{ itemId: 'latte', quantity: 1, selections }] }))[0].option_ids).toEqual(['tall'])
  })
})
