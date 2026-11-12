/**
 * get_ingredient — everything about one ingredient: on hand (per branch on a
 * multi-branch store), reorder level, the last few movements, which dishes
 * use it and how many of each the shelf still covers. Cost per unit only for
 * `costs` holders (never shown as ₱0 to anyone else).
 *
 * get_dish_recipe — what one dish uses, what is on the shelf for it, how many
 * the kitchen can still make, and its recipe cost for `costs` holders.
 *
 * Ceilings come from the same stock graph and arithmetic as the storefront and
 * checkout (`readTenantStockGraph` + `resolveProducibleUnits`).
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { readTenantStockGraph, type TenantStockGraph } from '@/lib/inventory/stock-graph-read'
import { getMenuItemCost } from '@/lib/inventory/costing-service'
import { evaluateStockLevel } from '@/lib/inventory/low-stock'
import { canSeeCosts } from '@/lib/inventory/cost-visibility'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { foldName } from '@/lib/assistant/insights/menu-import'
import { MOVEMENT_LABEL, dishRecipe, ingredientUsage, quantityLabel } from '@/lib/assistant/insights/ingredient-detail'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { InventoryItem } from '@/types/database'

const DISH_LIMIT = 8
const MOVEMENT_LIMIT = 5

function client(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

function loadIngredients(ctx: AssistantToolContext): Promise<InventoryItem[]> {
  return ctx.memo('ingredients', () => getIngredients(ctx.tenantId))
}

function loadGraph(ctx: AssistantToolContext): Promise<TenantStockGraph | null> {
  return ctx.memo('stock-graph', () => readTenantStockGraph(ctx.tenantId, null))
}

async function loadUnitLabels(ctx: AssistantToolContext): Promise<Map<string, string>> {
  return ctx.memo('unit-labels', async () => {
    const { data } = await client().from('inventory_units').select('id, abbreviation').eq('tenant_id', ctx.tenantId).limit(500)
    return new Map(((data ?? []) as Array<{ id: string; abbreviation: string }>).map((row) => [row.id, row.abbreviation]))
  })
}

/** By ref, else by exact (folded) name, else the one name containing it. */
export function pickIngredient(items: readonly InventoryItem[], wanted: string, byRef: string | null): InventoryItem | null | 'ambiguous' {
  if (byRef) return items.find((item) => item.id === byRef) ?? null
  const folded = foldName(wanted)
  const exact = items.filter((item) => foldName(item.name) === folded)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return 'ambiguous'
  const partial = items.filter((item) => foldName(item.name).includes(folded))
  if (partial.length === 1) return partial[0]
  return partial.length > 1 ? 'ambiguous' : null
}

/** The read selects `counted_at` (INVENTORY_ITEM_COLUMNS) though the generated row type predates it. */
function countedOn(item: InventoryItem): string | null {
  const counted = (item as InventoryItem & { counted_at?: string | null }).counted_at
  return typeof counted === 'string' ? counted.slice(0, 10) : null
}

interface BranchRow { outlet_id: string; current_qty: number | string | null }
interface MovementRow { reason: string; quantity_delta: number | string | null; created_at: string }

async function readBranchesAndMovements(tenantId: string, itemId: string) {
  const db = client()
  const [stock, outlets, movements] = await Promise.all([
    db.from('inventory_stock').select('outlet_id, current_qty').eq('tenant_id', tenantId).eq('inventory_item_id', itemId).limit(200),
    db.from('outlets').select('id, name').eq('tenant_id', tenantId).limit(200),
    db
      .from('stock_movements')
      .select('reason, quantity_delta, created_at')
      .eq('tenant_id', tenantId)
      .eq('inventory_item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(MOVEMENT_LIMIT),
  ])
  const outletNames = new Map(((outlets.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]))
  return {
    branches: ((stock.data ?? []) as BranchRow[]).map((row) => ({ name: outletNames.get(row.outlet_id) ?? 'A branch', quantity: Number(row.current_qty) || 0 })),
    movements: movements.error ? null : ((movements.data ?? []) as MovementRow[]),
  }
}

const ingredientInput = z.object({ ingredient: z.string().trim().min(1).describe('Ingredient ref (g1) or name') })
type IngredientInput = z.infer<typeof ingredientInput>

export const getIngredientTool: AssistantToolDef<IngredientInput> = {
  name: 'get_ingredient',
  description: 'One ingredient: on hand (per branch), reorder level, recent movements, which dishes use it and how many can still be made.',
  access: { permission: 'inventory' },
  isAvailable: (flags) => flags.inventoryEnabled,
  input: ingredientInput,
  async run(ctx, request) {
    const items = (await loadIngredients(ctx)).filter((item) => item.is_active !== false)
    const picked = pickIngredient(items, request.ingredient, ctx.refs.resolve(request.ingredient, 'ingredient'))
    if (picked === 'ambiguous') return { facts: { found: false, reason: `Several ingredients match "${request.ingredient}". Ask which one, or use get_inventory.` } }
    if (!picked) return { facts: { found: false, reason: `No active ingredient matches "${request.ingredient}".` } }

    const [units, graph, extra] = await Promise.all([loadUnitLabels(ctx), loadGraph(ctx), readBranchesAndMovements(ctx.tenantId, picked.id)])
    const unit = units.get(picked.stock_unit_id) ?? ''
    const onHand = Number(picked.current_qty) || 0
    const reorderAt = Number(picked.reorder_level) || 0
    const level = evaluateStockLevel({ current_qty: onHand, reorder_level: reorderAt })
    const showCosts = canSeeCosts(ctx.caller)
    const usage = graph ? ingredientUsage(picked.id, graph) : null
    const dishes = usage?.dishes.slice(0, DISH_LIMIT) ?? []

    return {
      facts: {
        ref: ctx.refs.refFor('ingredient', picked.id),
        name: picked.name,
        level,
        onHand: quantityLabel(onHand, unit),
        reorderAt: quantityLabel(reorderAt, unit),
        ...(extra.branches.length > 0 ? { byBranch: extra.branches.map((row) => ({ branch: row.name, onHand: quantityLabel(row.quantity, unit) })) } : {}),
        ...(showCosts ? { costPerUnit: Number(picked.unit_cost) || 0 } : {}),
        lastCounted: countedOn(picked),
        recentMovements:
          extra.movements?.map((row) => ({ what: MOVEMENT_LABEL[row.reason] ?? row.reason, change: quantityLabel(Number(row.quantity_delta) || 0, unit), when: row.created_at.slice(0, 16) })) ??
          'unavailable',
        usedIn: usage
          ? {
              dishes: dishes.map((dish) => ({ ref: ctx.refs.refFor('item', dish.menuItemId), dish: dish.dish, perDish: dish.perDish, canStillMake: dish.canMake ?? 'not tracked' })),
              moreDishes: Math.max(0, (usage.dishes.length ?? 0) - dishes.length),
              otherRecipes: usage.otherRecipes,
            }
          : 'unavailable',
      },
      card: {
        type: 'stats',
        title: picked.name,
        subtitle: level === 'out' ? 'Out of stock' : level === 'low' ? 'Running low' : 'In stock',
        items: [
          { label: 'On hand', value: quantityLabel(onHand, unit) },
          { label: 'Reorder at', value: quantityLabel(reorderAt, unit) },
          ...(showCosts ? [{ label: 'Cost per unit', value: formatPeso(Number(picked.unit_cost) || 0) }] : []),
          ...dishes.slice(0, 3).map((dish) => ({ label: dish.dish, value: dish.canMake === null ? '—' : `${dish.canMake} left`, hint: `${dish.perDish} each` })),
        ],
      },
      chips: [
        { label: 'Record a delivery', prompt: `I received more ${picked.name}.` },
        { label: 'Count it', prompt: `I counted ${picked.name}.` },
      ],
      links: [{ label: 'Open Inventory', path: '/inventory' }],
    }
  },
}

const recipeInput = z.object({ dish: z.string().trim().min(1).describe('Dish ref (i12) from search_menu, or exact name') })
type RecipeInput = z.infer<typeof recipeInput>

async function findDish(ctx: AssistantToolContext, wanted: string): Promise<{ id: string; name: string } | null | 'ambiguous'> {
  const byRef = ctx.refs.resolve(wanted, 'item')
  const query = client().from('menu_items').select('id, name').eq('tenant_id', ctx.tenantId)
  const { data } = byRef
    ? await query.eq('id', byRef).limit(1)
    : await query.ilike('name', wanted.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(2)
  const rows = (data ?? []) as Array<{ id: string; name: string }>
  if (rows.length > 1) return 'ambiguous'
  return rows[0] ?? null
}

export const getDishRecipeTool: AssistantToolDef<RecipeInput> = {
  name: 'get_dish_recipe',
  description: "One dish's recipe: ingredients per dish, what is on hand, how many can still be made, and its cost.",
  access: { permission: 'menu' },
  isAvailable: (flags) => flags.inventoryEnabled,
  input: recipeInput,
  async run(ctx, request) {
    const dish = await findDish(ctx, request.dish)
    if (dish === 'ambiguous') return { facts: { found: false, reason: `Several dishes match "${request.dish}". Use search_menu for its ref.` } }
    if (!dish) return { facts: { found: false, reason: `No dish matches "${request.dish}". Use search_menu for its ref.` } }

    const [graph, items, units] = await Promise.all([loadGraph(ctx), loadIngredients(ctx), loadUnitLabels(ctx)])
    if (!graph) return { facts: { found: false, reason: 'Recipes could not be read right now.' } }
    const names = new Map(items.map((item) => [item.id, { name: item.name, onHand: quantityLabel(Number(item.current_qty) || 0, units.get(item.stock_unit_id) ?? '') }]))
    const recipe = dishRecipe(dish.id, graph, names)
    if (!recipe || recipe.lines.length === 0) {
      return {
        facts: { dish: dish.name, hasRecipe: false, note: 'No recipe yet, so its stock is not tracked and it has no cost.' },
        links: [{ label: 'Add a recipe', path: `/menu/${dish.id}` }],
      }
    }

    let cost: number | null = null
    if (canSeeCosts(ctx.caller)) {
      try {
        cost = (await getMenuItemCost(ctx.tenantId, dish.id)).baseCost
      } catch {
        cost = null
      }
    }
    return {
      facts: {
        dish: dish.name,
        hasRecipe: true,
        canStillMake: recipe.canMake ?? 'not tracked',
        ingredients: recipe.lines.map((line) => ({ ref: ctx.refs.refFor('ingredient', line.ingredientId), name: line.ingredient, perDish: line.perDish, onHand: line.onHand })),
        ...(cost !== null ? { recipeCost: cost } : {}),
      },
      card: {
        type: 'ranked',
        title: `${dish.name} recipe`,
        subtitle: [recipe.canMake === null ? null : `${recipe.canMake} can still be made`, cost !== null ? `costs ${formatPeso(cost)} to make` : null].filter(Boolean).join(' · ') || undefined,
        rows: recipe.lines.map((line) => ({ label: line.ingredient, value: line.perDish, detail: line.onHand ? `${line.onHand} on hand` : undefined })),
      },
      links: [{ label: 'Open dish', path: `/menu/${dish.id}` }],
    }
  },
}
