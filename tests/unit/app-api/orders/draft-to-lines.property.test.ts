/**
 * Round trip: whatever the app can legally pick from the PROJECTED catalog
 * translates, and the server's whole pricing pipeline (`loadAndPriceOrderLines`
 * over the raw rows, the line sent at price 0 as the app sends it) charges
 * exactly the price the app displayed: the dish at the branch plus the deltas
 * of the picked options.
 *
 * Covers what used to be excluded: a chosen branch (dish and linked-dish
 * overrides, other branches' rows as noise) and category default add-ons, on
 * both the legacy path (merged, item wins on a name clash) and the unified
 * path (never shown, never priced) — with the store's flag either way.
 */
import fc from 'fast-check'
import type { AppMenuItem } from '@/lib/app-contract'
import { draftToOrderLines } from '@/lib/app-api/orders/draft-to-lines'
import { projectAppCatalog } from '@/lib/app-api/project-catalog'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { buildOutletMenuIndex, type OutletMenuOverrideRow } from '@/lib/outlets/outlet-menu-overrides'
import type { Addon, Category, MenuItem, ModifierGroup, Variation, VariationType } from '@/types/database'
import { fakeSupabaseTables } from '../../../fixtures/fake-supabase-tables'
import { createTestMenuItem } from '../../../fixtures/menu-item.fixture'
import { propertyParameters } from '../../../utils/property'

const TENANT = 't'
const OUTLET = 'outlet-1'
const CATEGORY: Category = { id: 'cat-1', tenant_id: TENANT, name: 'Menu', order: 0, is_active: true, display_layout: 'grid', created_at: '', updated_at: '' }
const NAMES = ['Large', 'Small', 'Oat milk', 'Cheese', 'Extra shot', 'Rice', 'Gravy', 'No onions']
const QUANTITY_CAP_WHEN_UNLIMITED = 6

const nameArb = fc.constantFrom(...NAMES)
const centavosArb = fc.integer({ min: 0, max: 50_000 })
const pesos = (centavos: number) => centavos / 100

/** Mostly true, so the interesting (listed, available, priced) paths are hit often. */
const mostlyTrue = fc.oneof({ arbitrary: fc.constant(true), weight: 4 }, { arbitrary: fc.constant(false), weight: 1 })

const linkedArb = fc.array(fc.record({ name: nameArb, price: centavosArb, discount: fc.option(centavosArb), isAvailable: mostlyTrue }), { maxLength: 2 })

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

const categoryDefaultsArb = fc.array(fc.record({ name: nameArb, price: centavosArb }), { maxLength: 3 })

/** A branch's opinion on one dish; null = no row. Rows for another branch are noise both sides must ignore. */
const overrideSpecArb = fc.option(
  fc.record({
    outletId: fc.oneof({ arbitrary: fc.constant(OUTLET), weight: 4 }, { arbitrary: fc.constant('outlet-2'), weight: 1 }),
    isListed: mostlyTrue,
    isAvailable: mostlyTrue,
    price: fc.option(centavosArb),
    discount: fc.option(centavosArb),
    discountCleared: fc.boolean(),
  }),
)

type OverrideSpec = NonNullable<typeof overrideSpecArb extends fc.Arbitrary<infer T> ? T : never>

interface Store {
  dish: MenuItem
  linked: MenuItem[]
  tenant: Record<string, unknown>
}

interface Scenario extends Store {
  category: Category
  overrides: OutletMenuOverrideRow[]
  outletId: string | null
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
  const unified = fc.tuple(unifiedGroupsArb(linked.length), fc.boolean()).map(([specs, isFlagOn]): Store => {
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
    // Flag off: the store shows the legacy columns (here only the category's
    // defaults) even though the dish carries groups.
    return { dish: createTestMenuItem({ id: 'dish', category_id: 'cat-1', name: 'Dish', modifier_groups: groups }), linked, tenant: { modifier_groups_enabled: isFlagOn } }
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

const toOverride = (menuItemId: string, spec: OverrideSpec): OutletMenuOverrideRow & Record<string, unknown> => ({
  id: `ovr-${spec.outletId}-${menuItemId}`,
  tenant_id: TENANT,
  outlet_id: spec.outletId,
  menu_item_id: menuItemId,
  is_listed: spec.isListed,
  is_available: spec.isAvailable,
  price: spec.price === null ? null : pesos(spec.price),
  discounted_price: spec.discount === null ? null : pesos(spec.discount),
  discount_cleared: spec.discountCleared,
  created_at: '',
  updated_at: '',
})

const scenarioArb: fc.Arbitrary<Scenario> = storeArb.chain((store) =>
  fc
    .record({
      defaults: categoryDefaultsArb,
      outletId: fc.option(fc.constant(OUTLET)),
      dishOverride: overrideSpecArb,
      linkedOverrides: fc.array(overrideSpecArb, { minLength: store.linked.length, maxLength: store.linked.length }),
    })
    .map(({ defaults, outletId, dishOverride, linkedOverrides }): Scenario => {
      const defaultAddons: Addon[] = defaults.map((addon, c) => ({ id: `ca${c}`, name: addon.name, price: pesos(addon.price) }))
      const specs: Array<[string, OverrideSpec | null]> = [['dish', dishOverride], ...store.linked.map((row, index): [string, OverrideSpec | null] => [row.id, linkedOverrides[index]])]
      return {
        ...store,
        category: { ...CATEGORY, default_addons: defaultAddons },
        overrides: specs.flatMap(([menuItemId, spec]) => (spec === null ? [] : [toOverride(menuItemId, spec)])),
        outletId,
      }
    }),
)

const projectDish = (scenario: Scenario): AppMenuItem | undefined =>
  projectAppCatalog({
    tenant: scenario.tenant,
    categories: [scenario.category],
    menuItems: [scenario.dish, ...scenario.linked],
    orderTypes: [],
    outlets: [],
    outletOverrides: scenario.overrides,
    outletId: scenario.outletId,
    paymentMethods: [],
    pairs: [],
  }).items.find((item) => item.id === 'dish')

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
  it('translates every legal catalog pick, and the server pipeline charges exactly the price the app showed', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, fc.integer({ min: 1, max: 99 }), fc.gen(), async (scenario, quantity, gen) => {
        const item = projectDish(scenario)
        fc.pre(item !== undefined && item.isAvailable)
        const shown = item as AppMenuItem
        const selections = pickSelections(gen, shown)
        fc.pre(selections !== null)
        const rows = [scenario.dish, ...scenario.linked]
        const result = draftToOrderLines({
          lines: [{ itemId: 'dish', quantity, selections: selections as Selections }],
          menuItems: new Map(rows.map((row) => [row.id, row])),
          categories: [scenario.category],
          tenant: scenario.tenant,
          branchIndex: buildOutletMenuIndex(scenario.overrides),
          outletId: scenario.outletId,
        })
        if (!result.ok) throw new Error(result.error)
        const [line] = result.lines
        expect(parseOrderLines([line]).ok).toBe(true)

        // The server pipeline over the raw rows; any selection gap is logged.
        const { client } = fakeSupabaseTables({
          menu_items: rows.map((row) => ({ ...row, tenant_id: TENANT })),
          categories: [scenario.category],
          outlet_menu_items: scenario.overrides,
        })
        const gaps = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const priced = await loadAndPriceOrderLines(client, TENANT, [line], scenario.outletId, {
          modifierGroupsEnabled: scenario.tenant.modifier_groups_enabled === true,
        }).finally(() => gaps.mockRestore())
        if (!priced.ok) throw new Error(priced.error)
        expect(gaps.mock.calls).toEqual([])

        const shownUnit = Math.round(shown.price * 100) + shownDeltaCentavos(shown, selections as Selections)
        expect(Math.round(priced.lines[0].price * 100)).toBe(shownUnit)
        expect(Math.round(priced.itemsSubtotal * 100)).toBe(shownUnit * quantity)
      }),
      propertyParameters(),
    )
    // Each run awaits the real pipeline; under a loaded full-suite run 200 of them can pass 5s.
  }, 60_000)
})
