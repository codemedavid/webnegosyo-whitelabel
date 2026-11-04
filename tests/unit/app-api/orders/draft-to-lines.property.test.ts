/**
 * Round trip: whatever the app can legally pick from the PROJECTED catalog
 * translates, and the server's own modifier pricing (`priceLineModifiers`, fed
 * the raw dish row like `loadAndPriceOrderLines` does) charges exactly the
 * deltas the app was shown.
 *
 * Store-wide menu only (outletId null) and no category default add-ons: the
 * server prices linked options at their store-wide price and does not see
 * category add-ons at all (it reads the dish's own columns), so neither can
 * round-trip today — see the Phase 4 report.
 */
import fc from 'fast-check'
import type { AppMenuItem } from '@/lib/app-contract'
import { draftToOrderLines } from '@/lib/app-api/orders/draft-to-lines'
import { projectAppCatalog } from '@/lib/app-api/project-catalog'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { priceLineModifiers } from '@/lib/order-line-modifier-pricing'
import { buildOutletMenuIndex } from '@/lib/outlets/outlet-menu-overrides'
import type { Addon, Category, MenuItem, ModifierGroup, Variation, VariationType } from '@/types/database'
import { createTestMenuItem } from '../../../fixtures/menu-item.fixture'
import { propertyParameters } from '../../../utils/property'

const CATEGORY: Category = { id: 'cat-1', tenant_id: 't', name: 'Menu', order: 0, is_active: true, display_layout: 'grid', created_at: '', updated_at: '' }
const NAMES = ['Large', 'Small', 'Oat milk', 'Cheese', 'Extra shot', 'Rice', 'Gravy', 'No onions']
const QUANTITY_CAP_WHEN_UNLIMITED = 6

const nameArb = fc.constantFrom(...NAMES)
const centavosArb = fc.integer({ min: 0, max: 50_000 })
const pesos = (centavos: number) => centavos / 100

const linkedArb = fc.array(fc.record({ name: nameArb, price: centavosArb, discount: fc.option(centavosArb), isAvailable: fc.boolean() }), { maxLength: 2 })

const unifiedGroupsArb = (linkedCount: number) =>
  fc.array(
    fc.record({
      mode: fc.constantFrom('choice' as const, 'quantity' as const),
      min: fc.integer({ min: 0, max: 2 }),
      max: fc.option(fc.integer({ min: 0, max: 4 })),
      options: fc.array(
        fc.record({ name: nameArb, price: centavosArb, isAvailable: fc.boolean(), link: fc.option(fc.nat({ max: Math.max(0, linkedCount - 1) }), { freq: linkedCount > 0 ? 3 : 1000 }) }),
        { minLength: 1, maxLength: 4 },
      ),
    }),
    { maxLength: 4 },
  )

const legacyArb = fc.record({
  types: fc.array(fc.record({ required: fc.boolean(), options: fc.array(fc.record({ name: nameArb, price: centavosArb }), { minLength: 1, maxLength: 4 }) }), { maxLength: 3 }),
  flat: fc.array(fc.record({ name: nameArb, price: centavosArb }), { maxLength: 4 }),
  addons: fc.array(fc.record({ name: nameArb, price: centavosArb }), { maxLength: 3 }),
})

interface Store {
  dish: MenuItem
  linked: MenuItem[]
  tenant: Record<string, unknown>
}

const storeArb: fc.Arbitrary<Store> = linkedArb.chain((linkedSpecs) => {
  const linked = linkedSpecs.map((spec, index) =>
    createTestMenuItem({
      id: `linked-${index}`,
      category_id: 'cat-1',
      name: spec.name,
      price: pesos(spec.price),
      discounted_price: spec.discount === null ? undefined : pesos(spec.discount),
      is_available: spec.isAvailable,
    }),
  )
  const unified = unifiedGroupsArb(linked.length).map((specs): Store => {
    const groups: ModifierGroup[] = specs.map((spec, g) => ({
      id: `g${g}`,
      name: `Group ${g}`,
      selection_mode: spec.mode,
      display_order: g,
      min_select: spec.min,
      max_select: spec.max,
      options: spec.options.map((option, o) => ({
        id: `g${g}o${o}`,
        name: option.name,
        price_modifier: pesos(option.price),
        display_order: o,
        is_available: option.isAvailable,
        ...(option.link !== null && linked[option.link] ? { menu_item_id: linked[option.link].id } : {}),
      })),
    }))
    return { dish: createTestMenuItem({ id: 'dish', category_id: 'cat-1', name: 'Dish', modifier_groups: groups }), linked, tenant: { modifier_groups_enabled: true } }
  })
  const legacy = legacyArb.map((spec): Store => {
    const variationTypes: VariationType[] = spec.types.map((type, t) => ({
      id: `t${t}`,
      name: `Type ${t}`,
      is_required: type.required,
      display_order: t,
      options: type.options.map((option, o) => ({ id: `t${t}o${o}`, name: option.name, price_modifier: pesos(option.price), display_order: o })),
    }))
    const variations: Variation[] = spec.flat.map((option, v) => ({ id: `v${v}`, name: option.name, price_modifier: pesos(option.price) }))
    const addons: Addon[] = spec.addons.map((option, a) => ({ id: `a${a}`, name: option.name, price: pesos(option.price) }))
    return { dish: createTestMenuItem({ id: 'dish', category_id: 'cat-1', name: 'Dish', variation_types: variationTypes, variations, addons }), linked, tenant: {} }
  })
  return fc.oneof(unified, legacy)
})

const projectDish = (store: Store): AppMenuItem =>
  projectAppCatalog({
    tenant: store.tenant,
    categories: [CATEGORY],
    menuItems: [store.dish, ...store.linked],
    orderTypes: [],
    outlets: [],
    outletOverrides: [],
    outletId: null,
    paymentMethods: [],
    pairs: [],
  }).items.find((item) => item.id === 'dish') as AppMenuItem

type Selections = Record<string, Record<string, number>>

/** A legal pick the app could make, drawn from the projected groups; null when the dish has none. */
function pickSelections(gen: fc.GeneratorValue, item: AppMenuItem): Selections | null {
  const selections: Selections = {}
  for (const group of item.modifierGroups) {
    const open = group.options.filter((option) => option.isAvailable)
    if (group.selectionMode === 'choice') {
      const cap = Math.min(group.maxSelect ?? open.length, open.length)
      if (cap < group.minSelect) return null
      const count = gen(fc.integer, { min: group.minSelect, max: cap })
      const chosen = gen(fc.shuffledSubarray, open, { minLength: count, maxLength: count })
      if (chosen.length > 0) selections[group.id] = Object.fromEntries(chosen.map((option) => [option.id, 1]))
      continue
    }
    const cap = group.maxSelect ?? QUANTITY_CAP_WHEN_UNLIMITED
    if (open.length === 0 ? group.minSelect > 0 : cap < group.minSelect) return null
    const total = open.length === 0 ? 0 : gen(fc.integer, { min: group.minSelect, max: cap })
    const portions: Record<string, number> = {}
    for (let unit = 0; unit < total; unit += 1) {
      const option = open[gen(fc.nat, { max: open.length - 1 })]
      portions[option.id] = (portions[option.id] ?? 0) + 1
    }
    if (total > 0) selections[group.id] = portions
  }
  return selections
}

function shownDeltaCentavos(item: AppMenuItem, selections: Selections): number {
  return item.modifierGroups.reduce((sum, group) => {
    const picked = selections[group.id] ?? {}
    return sum + group.options.reduce((inner, option) => inner + Math.round(option.priceDelta * 100) * (picked[option.id] ?? 0), 0)
  }, 0)
}

describe('draftToOrderLines round trip (property)', () => {
  it('translates every legal catalog pick, and the server prices it at the deltas the app showed', () => {
    fc.assert(
      fc.property(storeArb, fc.integer({ min: 1, max: 99 }), fc.gen(), (store, quantity, gen) => {
        const item = projectDish(store)
        const selections = pickSelections(gen, item)
        fc.pre(selections !== null)
        const result = draftToOrderLines({
          lines: [{ itemId: 'dish', quantity, selections: selections as Selections }],
          menuItems: new Map([store.dish, ...store.linked].map((row) => [row.id, row])),
          categories: [CATEGORY],
          tenant: store.tenant,
          branchIndex: buildOutletMenuIndex([]),
          outletId: null,
        })
        if (!result.ok) throw new Error(result.error)
        const [line] = result.lines
        expect(parseOrderLines([line]).ok).toBe(true)
        const pricing = priceLineModifiers(line, store.dish, new Map(store.linked.map((row) => [row.id, row])))
        expect(pricing.unknownIds).toEqual([])
        expect(pricing.unpricedLabels).toEqual([])
        expect(Math.round(pricing.delta * 100)).toBe(shownDeltaCentavos(item, selections as Selections))
      }),
      propertyParameters(),
    )
  })
})
