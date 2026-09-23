import { describe, it, expect } from '@jest/globals'
import {
  collectLinkedModifierItemIds,
  priceLineModifiers,
  type LinkedModifierItem,
  type ModifierCatalogSource,
} from '@/lib/order-line-modifier-pricing'

/**
 * What the options and add-ons on one order line are worth, from the dish's
 * OWN JSON — never from the price the browser put on the line.
 *
 * The server used to floor only the base price, so a line claiming "Large"
 * (+₱40) and "Extra cheese ×2" (+₱30) at the base price was accepted and the
 * kitchen made the large one. Every item shape the storefront can put in a
 * cart is exercised here, because a wrong floor either gives food away or
 * silently overcharges a real customer.
 */

const NO_LINKS = new Map<string, LinkedModifierItem>()

const legacyItem: ModifierCatalogSource = {
  variations: [
    { id: 'v-small', name: 'Small', price_modifier: 0 },
    { id: 'v-large', name: 'Large', price_modifier: 40 },
  ],
  addons: [
    { id: 'a-cheese', name: 'Extra cheese', price: 15 },
    { id: 'a-egg', name: 'Egg', price: 20 },
  ],
}

const groupedItem: ModifierCatalogSource = {
  variation_types: [
    {
      id: 't-size',
      name: 'Size',
      is_required: true,
      display_order: 0,
      options: [
        { id: 'o-reg', name: 'Regular', price_modifier: 0, display_order: 0 },
        { id: 'o-big', name: 'Big', price_modifier: 25, display_order: 1 },
      ],
    },
    {
      id: 't-rice',
      name: 'Rice',
      is_required: false,
      display_order: 1,
      options: [{ id: 'o-norice', name: 'No rice', price_modifier: -10, display_order: 0 }],
    },
  ],
  addons: [{ id: 'a-gravy', name: 'Gravy', price: 12 }],
}

const modifierGroupItem: ModifierCatalogSource = {
  modifier_groups: [
    {
      id: 'g-size',
      name: 'Size',
      display_order: 0,
      min_select: 1,
      max_select: 1,
      options: [
        { id: 'm-12', name: '12 oz', price_modifier: 0, display_order: 0 },
        { id: 'm-16', name: '16 oz', price_modifier: 30, display_order: 1 },
      ],
    },
    {
      id: 'g-shots',
      name: 'Extras',
      selection_mode: 'quantity',
      display_order: 1,
      min_select: 0,
      max_select: null,
      options: [
        { id: 'm-shot', name: 'Espresso shot', price_modifier: 35, display_order: 0 },
        { id: 'm-coke', name: '', price_modifier: 0, display_order: 1, menu_item_id: 'coke' },
      ],
    },
  ],
}

describe('priceLineModifiers — legacy flat variations and add-ons', () => {
  it('prices a claimed variation and add-on by id', () => {
    const result = priceLineModifiers(
      { option_ids: ['v-large'], addon_ids: ['a-cheese'], variation: 'Large', addons: ['Extra cheese'] },
      legacyItem,
      NO_LINKS
    )

    expect(result.delta).toBe(55)
    expect(result.unknownIds).toEqual([])
  })

  it('multiplies an add-on by its per-unit quantity', () => {
    const result = priceLineModifiers(
      { option_ids: [], addon_ids: ['a-cheese'], addon_quantities: { 'a-cheese': 3 }, addons: ['Extra cheese ×3'] },
      legacyItem,
      NO_LINKS
    )

    expect(result.delta).toBe(45)
  })

  it('prices a line with no selections at zero', () => {
    expect(priceLineModifiers({ option_ids: [], addon_ids: [], addons: [] }, legacyItem, NO_LINKS).delta).toBe(0)
  })
})

describe('priceLineModifiers — grouped variation types', () => {
  it('sums one option per group plus add-ons', () => {
    const result = priceLineModifiers(
      { option_ids: ['o-big'], addon_ids: ['a-gravy'], variation: 'Big', addons: ['Gravy'] },
      groupedItem,
      NO_LINKS
    )

    expect(result.delta).toBe(37)
  })

  it('applies a negative option the customer can see on the ticket', () => {
    const result = priceLineModifiers(
      { option_ids: ['o-reg', 'o-norice'], addon_ids: [], variation: 'Regular, No rice', addons: [] },
      groupedItem,
      NO_LINKS
    )

    expect(result.delta).toBe(-10)
  })

  it('does not honour a negative option id the ticket never names', () => {
    // Claiming "No rice" by id while the kitchen sees only "Big" would buy a
    // ₱10 discount on a dish that is made in full.
    const result = priceLineModifiers(
      { option_ids: ['o-big', 'o-norice'], addon_ids: [], variation: 'Big', addons: [] },
      groupedItem,
      NO_LINKS
    )

    expect(result.delta).toBe(25)
  })
})

describe('priceLineModifiers — unified modifier groups', () => {
  it('prices a single-select option and quantity-mode portions', () => {
    const result = priceLineModifiers(
      {
        option_ids: ['m-16'],
        addon_ids: ['m-shot'],
        addon_quantities: { 'm-shot': 2 },
        variation: '16 oz',
        addons: ['Espresso shot ×2'],
      },
      modifierGroupItem,
      NO_LINKS
    )

    expect(result.delta).toBe(100)
  })

  it('prices a linked option from the linked menu item, at its sale price', () => {
    const links = new Map<string, LinkedModifierItem>([
      ['coke', { id: 'coke', name: 'Coke', price: 60, discounted_price: 45 }],
    ])

    const result = priceLineModifiers(
      { option_ids: [], addon_ids: ['m-coke'], addons: ['Coke'] },
      modifierGroupItem,
      links
    )

    expect(result.delta).toBe(45)
  })

  it('lists linked item ids so the caller can fetch them', () => {
    expect(collectLinkedModifierItemIds(modifierGroupItem)).toEqual(['coke'])
    expect(collectLinkedModifierItemIds(legacyItem)).toEqual([])
  })
})

describe('priceLineModifiers — forged and stale selections', () => {
  it('prices a selection named only in the text when the ids were left off', () => {
    // The kitchen reads the text. Dropping the ids must not make "Large" free.
    const result = priceLineModifiers(
      { variation: 'Large', addons: ['Extra cheese ×2'] },
      legacyItem,
      NO_LINKS
    )

    expect(result.delta).toBe(70)
  })

  it('prices the text when it names a dearer option than the id claims', () => {
    const result = priceLineModifiers(
      { option_ids: ['v-small'], addon_ids: [], variation: 'Large', addons: [] },
      legacyItem,
      NO_LINKS
    )

    expect(result.delta).toBe(40)
  })

  it('reports ids that are not on the dish and prices them at nothing', () => {
    const result = priceLineModifiers(
      { option_ids: ['someone-elses-option'], addon_ids: [], variation: '', addons: [] },
      legacyItem,
      NO_LINKS
    )

    expect(result.unknownIds).toEqual(['someone-elses-option'])
    expect(result.delta).toBe(0)
  })

  it('does not double-charge an option whose id and text agree', () => {
    const result = priceLineModifiers(
      { option_ids: ['v-large'], addon_ids: ['a-egg'], variation: 'Large', addons: ['Egg'] },
      legacyItem,
      NO_LINKS
    )

    expect(result.delta).toBe(60)
  })

  it('reports text it cannot match instead of guessing a price', () => {
    const result = priceLineModifiers(
      { option_ids: [], addon_ids: [], variation: 'Jumbo', addons: [] },
      legacyItem,
      NO_LINKS
    )

    expect(result.delta).toBe(0)
    expect(result.unpricedLabels).toEqual(['Jumbo'])
  })

  it('keeps an option name that itself contains a comma whole', () => {
    const item: ModifierCatalogSource = {
      variations: [{ id: 'v-combo', name: 'Rice, extra', price_modifier: 20 }],
    }

    const result = priceLineModifiers({ option_ids: ['v-combo'], variation: 'Rice, extra' }, item, NO_LINKS)

    expect(result.delta).toBe(20)
    expect(result.unpricedLabels).toEqual([])
  })

  it('uses the cheaper price when one id appears in two legacy shapes', () => {
    const item: ModifierCatalogSource = {
      modifier_groups: [
        {
          id: 'g',
          name: 'Size',
          display_order: 0,
          min_select: 0,
          max_select: 1,
          options: [{ id: 'dup', name: 'Large', price_modifier: 30, display_order: 0 }],
        },
      ],
      variations: [{ id: 'dup', name: 'Large', price_modifier: 25 }],
    }

    expect(priceLineModifiers({ option_ids: ['dup'], variation: 'Large' }, item, NO_LINKS).delta).toBe(25)
  })

  it('survives malformed JSON on the dish without throwing', () => {
    const item = { variations: 'nope', addons: [null, { id: 5 }], modifier_groups: {} } as unknown as ModifierCatalogSource

    expect(priceLineModifiers({ option_ids: ['x'], addons: ['y'] }, item, NO_LINKS).delta).toBe(0)
  })
})
