/**
 * Coverage audit (2026-10-13): behaviours of order → ingredient depletion that
 * had no test. `[FIXED]` tests were `[BUG]`s fixed the same day;
 * `[SEMANTICS]` tests pin current behaviour so a future change to it is
 * deliberate.
 */

import { resolveOrderDepletions } from '@/lib/inventory/order-depletion'
import { expandLinkedStockItems } from '@/lib/inventory/option-stock'
import { findCartStockShortfalls } from '@/lib/inventory/producible'
import { resolveMovementDelta } from '@/lib/inventory/stock-ledger'
import { recipeLineProblem } from '@/lib/inventory/recipe-line-rules'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { ModifierGroup, Recipe, RecipeComponent } from '@/types/database'

const GRAM: InventoryUnit = { id: 'g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const KILO: InventoryUnit = { id: 'kg', name: 'kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 }
const ML: InventoryUnit = { id: 'ml', name: 'millilitre', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1 }

const recipe = (over: Partial<Recipe>): Recipe =>
  ({ tenant_id: 't', target_type: 'menu_item', menu_item_id: 'latte', created_at: '', updated_at: '', ...over }) as Recipe

const line = (over: Partial<RecipeComponent>): RecipeComponent =>
  ({ tenant_id: 't', quantity: 1, unit_id: 'ml', sort_order: 0, created_at: '', ...over }) as RecipeComponent

const LATTE_BASE = recipe({ id: 'r-base' })
const MILK_200 = line({ id: 'c-milk', recipe_id: 'r-base', inventory_item_id: 'milk', quantity: 200 })

describe('[SEMANTICS] option recipes ADD to the base recipe', () => {
  it('a "Large" size option recipe is spent on top of the base, never instead of it', () => {
    // Arrange: base latte = 200 ml milk; the merchant typed the Large recipe as 300 ml.
    const large = recipe({ id: 'r-large', target_type: 'variation_option', variation_option_id: 'size-large' })
    const largeMilk = line({ id: 'c-large', recipe_id: 'r-large', inventory_item_id: 'milk', quantity: 300 })

    // Act
    const spent = resolveOrderDepletions(
      [{ menuItemId: 'latte', quantity: 1, optionIds: ['size-large'], modifierOptionIds: ['size-large'] }],
      [LATTE_BASE, large],
      [MILK_200, largeMilk],
    )

    // Assert: 500 ml, not 300 ml. No replace/scale semantics exist; since
    // 2026-10-13 the editor says so ("Extra ingredients for this choice",
    // recipe-copy.ts).
    expect(spent).toEqual([{ inventoryItemId: 'milk', quantity: 500, unitId: 'ml' }])
  })

  it('cannot express a substitution: oat milk is spent and dairy milk is spent too', () => {
    const oat = recipe({ id: 'r-oat', target_type: 'modifier_option', modifier_option_id: 'oat' })
    const oatLine = line({ id: 'c-oat', recipe_id: 'r-oat', inventory_item_id: 'oat-milk', quantity: 200 })

    const spent = resolveOrderDepletions(
      [{ menuItemId: 'latte', quantity: 1, optionIds: ['oat'], modifierOptionIds: ['oat'] }],
      [LATTE_BASE, oat],
      [MILK_200, oatLine],
    )

    // Dairy milk is still deducted: recipe_components.quantity >= 0 (no
    // negative/"remove" lines) and there is no "replaces ingredient" mapping.
    expect(spent).toEqual(
      expect.arrayContaining([
        { inventoryItemId: 'milk', quantity: 200, unitId: 'ml' },
        { inventoryItemId: 'oat-milk', quantity: 200, unitId: 'ml' },
      ]),
    )
  })
})

describe('[SEMANTICS] multi-select and mixed units', () => {
  it('spends every option picked in a multi-select group', () => {
    const syrup = recipe({ id: 'r-syrup', target_type: 'modifier_option', modifier_option_id: 'vanilla' })
    const shot = recipe({ id: 'r-shot', target_type: 'modifier_option', modifier_option_id: 'shot' })
    const spent = resolveOrderDepletions(
      [{ menuItemId: 'latte', quantity: 2, addonIds: ['vanilla', 'shot'], modifierOptionIds: ['vanilla', 'shot'] }],
      [LATTE_BASE, syrup, shot],
      [
        MILK_200,
        line({ id: 'c-syr', recipe_id: 'r-syrup', inventory_item_id: 'vanilla-syrup', quantity: 15 }),
        line({ id: 'c-shot', recipe_id: 'r-shot', inventory_item_id: 'beans', quantity: 18, unit_id: 'g' }),
      ],
    )
    expect(spent).toEqual(
      expect.arrayContaining([
        { inventoryItemId: 'milk', quantity: 400, unitId: 'ml' },
        { inventoryItemId: 'vanilla-syrup', quantity: 30, unitId: 'ml' },
        { inventoryItemId: 'beans', quantity: 36, unitId: 'g' },
      ]),
    )
  })

  it('a POS line repeating an option id (no quantity map) spends it ONCE', () => {
    // The register has no quantity-mode modifiers and sends no addonQuantities.
    const shot = recipe({ id: 'r-shot', target_type: 'modifier_option', modifier_option_id: 'shot' })
    const spent = resolveOrderDepletions(
      [{ menuItemId: 'latte', quantity: 1, optionIds: ['shot', 'shot'], addonIds: ['shot', 'shot'], modifierOptionIds: ['shot'] }],
      [shot],
      [line({ id: 'c-shot', recipe_id: 'r-shot', inventory_item_id: 'beans', quantity: 18, unit_id: 'g' })],
    )
    expect(spent).toEqual([{ inventoryItemId: 'beans', quantity: 18, unitId: 'g' }])
  })

  it('same ingredient in base (g) and add-on (kg) nets to the right stock-unit total', () => {
    const extra = recipe({ id: 'r-extra', target_type: 'addon', addon_id: 'extra-beef' })
    const spent = resolveOrderDepletions(
      [{ menuItemId: 'latte', quantity: 2, addonIds: ['extra-beef'], addonQuantities: { 'extra-beef': 2 } }],
      [LATTE_BASE, extra],
      [
        line({ id: 'c-b', recipe_id: 'r-base', inventory_item_id: 'beef', quantity: 150, unit_id: 'g' }),
        line({ id: 'c-x', recipe_id: 'r-extra', inventory_item_id: 'beef', quantity: 0.1, unit_id: 'kg' }),
      ],
    )
    const units: Record<string, InventoryUnit> = { g: GRAM, kg: KILO, ml: ML }
    const totalKg = spent.reduce(
      (sum, d) => sum + resolveMovementDelta({ reason: 'sale', quantity: d.quantity, unit: units[d.unitId], stockUnit: KILO, currentQty: 0 }),
      0,
    )
    // 2 × 150 g + 2 × 2 × 0.1 kg = 0.3 + 0.4 = 0.7 kg
    expect(totalKg).toBeCloseTo(-0.7, 6)
  })
})

describe('[SEMANTICS] stock-tracking mode "Don\'t track" on a modifier option', () => {
  it('still spends the recipe of an option set to "Don\'t track" — it only means no separate count', () => {
    // Live (2026-10-13) every option recipe is 'none'/null and merchants rely on
    // it deducting. "Don't track" = no simple counter for the option; its
    // recipe ingredients are still used on top of the dish's own recipe.
    const groups: ModifierGroup[] = [{ id: 'g', name: 'Extras', display_order: 0, min_select: 0, max_select: null, options: [
      { id: 'pearls', name: 'Pearls', display_order: 0, price_modifier: 15, stock_mode: 'none', cost_mode: 'composite' },
    ] } as ModifierGroup]
    const pearls = recipe({ id: 'r-pearls', target_type: 'modifier_option', modifier_option_id: 'pearls', menu_item_id: 'milktea' })
    const items = [{ menuItemId: 'milktea', quantity: 1, addonIds: ['pearls'], modifierOptionIds: ['pearls'] }]

    const spent = resolveOrderDepletions(
      expandLinkedStockItems(items, [{ id: 'milktea', modifier_groups: groups }], [pearls]),
      [pearls],
      [line({ id: 'c-p', recipe_id: 'r-pearls', inventory_item_id: 'tapioca', quantity: 50, unit_id: 'g' })],
    )

    expect(spent).toEqual([{ inventoryItemId: 'tapioca', quantity: 50, unitId: 'g' }])
  })
})

describe('[FIXED] checkout producible guard reads option/add-on ingredients', () => {
  it('refuses a cart whose selected add-on needs an ingredient that is out of stock', () => {
    const pearls = recipe({ id: 'r-pearls', target_type: 'modifier_option', modifier_option_id: 'pearls', menu_item_id: 'milktea' })
    const base = recipe({ id: 'r-mt', menu_item_id: 'milktea' })
    const shortfalls = findCartStockShortfalls(
      [{ menuItemId: 'milktea', quantity: 1, addonIds: ['pearls'], modifierOptionIds: ['pearls'] }],
      [base, pearls],
      [
        line({ id: 'c-tea', recipe_id: 'r-mt', inventory_item_id: 'tea', quantity: 10, unit_id: 'g' }),
        line({ id: 'c-p', recipe_id: 'r-pearls', inventory_item_id: 'tapioca', quantity: 50, unit_id: 'g' }),
      ],
      [
        { id: 'tea', current_qty: 1000, is_active: true, stockUnit: GRAM },
        { id: 'tapioca', current_qty: 0, is_active: true, stockUnit: GRAM },
      ],
      [GRAM],
    )
    // Was [] — only the BASE recipe constrained, and createOrderAction did not
    // pass option ids. Both fixed 2026-10-13.
    expect(shortfalls).toEqual([{ menuItemId: 'milktea', requested: 1, producible: 0 }])
  })
})

describe('[FIXED] a recipe line in a unit that cannot convert is refused at save', () => {
  const PCS: InventoryUnit = { id: 'pcs', name: 'piece', abbreviation: 'pcs', dimension: 'count', to_base_factor: 1 }

  it('refuses "50 g of egg" for an egg stocked by the piece, so it can never sit unspent', () => {
    // The guard still PASSES OVER an unconvertible line already in the
    // database (ignorance, never zero — inventory-producible.test.ts); the fix
    // is that no new one can be saved (recipeLineProblem, used by the web
    // recipe savers).
    const problem = recipeLineProblem({ quantity: 50, unit_id: 'g' }, { name: 'Egg', stock_unit_id: 'pcs' }, [GRAM, PCS])
    expect(problem).toMatch(/Egg/)
    expect(problem).toMatch(/pcs/)

    const units = findCartStockShortfalls(
      [{ menuItemId: 'silog', quantity: 1 }],
      [recipe({ id: 'r-silog', menu_item_id: 'silog' })],
      [line({ id: 'c-egg', recipe_id: 'r-silog', inventory_item_id: 'egg', quantity: 50, unit_id: 'g' })],
      [{ id: 'egg', current_qty: 0, is_active: true, stockUnit: PCS }],
      [GRAM, PCS],
    )
    expect(units).toEqual([])
  })
})
