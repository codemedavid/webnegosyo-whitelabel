import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { getUnits } from '@/lib/inventory/units-service'
import { ingredientsForCaller } from '@/lib/inventory/cost-visibility'
import { isRecipeLineRejection } from '@/lib/inventory/recipe-line-rules'
import { invalidateStockCeilings } from '@/lib/inventory/ceilings-cache'
import { DISH_RECIPES_STALE, loadDishRecipes, saveDishRecipes } from '@/lib/inventory/dish-recipe/service'
import { defineRoute } from '@/platform/http/define-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A dish's whole recipe set — the dish recipe and every choice's — for the
 * "recipe by size" table (docs/plans/2026-11-21-dish-recipes-by-size.md).
 * GET reads it with its version; PUT saves it in one transaction
 * (`save_dish_recipes`, RLS as the caller: menu on a store-wide account).
 * Cookie session or the merchant app's Bearer token.
 */

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function fail(status: number, error: string, code?: string): NextResponse {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status, headers: NO_STORE })
}

/** The refusals a merchant can act on; anything else is a fixed sentence. */
function failure(error: unknown, operation: 'read' | 'save'): NextResponse {
  if (isRecipeLineRejection(error)) return fail(400, error.message)
  if (error instanceof Error && error.name === DISH_RECIPES_STALE) return fail(409, error.message, 'stale')
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('Forbidden:')) return fail(403, message.replace(/^Forbidden: /, ''))
  if (message.startsWith('Not found:')) return fail(404, 'This dish could not be found.')
  if (message.startsWith('This dish has too many')) return fail(422, message)
  console.error(`[inventory] dish recipe ${operation} failed`, message || error)
  return fail(500, operation === 'read' ? 'The recipes could not be loaded. Try again.' : 'The recipes could not be saved. Try again.')
}

export const GET = defineRoute({
  auth: { kind: 'staff', permission: 'menu', branch: 'any', access: 'view', storeClaim: ({ query }) => query.tenantId },
  rateLimit: { bucket: 'dish-recipe-read', per: 'user', max: 120, window: '1m' },
  query: z.object({ tenantId: z.string().uuid(), menuItemId: z.string().uuid() }),
  handler: async ({ tenant, appUser, query }) => {
    try {
      const [ingredients, units, snapshot] = await Promise.all([
        getIngredients(tenant),
        getUnits(tenant),
        loadDishRecipes(tenant, query.menuItemId),
      ])
      // What an ingredient costs is `costs`: without it the prices are left out.
      return NextResponse.json(
        { success: true, data: { ingredients: ingredientsForCaller(ingredients, appUser), units, snapshot } },
        { headers: NO_STORE },
      )
    } catch (error) {
      return failure(error, 'read')
    }
  },
})

export const PUT = defineRoute({
  auth: { kind: 'staff', permission: 'menu', branch: 'store-wide', storeClaim: ({ body }) => body.tenantId },
  rateLimit: { bucket: 'dish-recipe-save', per: 'user', max: 30, window: '1m' },
  body: z.object({
    tenantId: z.string().uuid(),
    tenantSlug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
    menuItemId: z.string().uuid(),
    version: z.string().max(64),
    recipes: z.unknown(),
  }),
  handler: async ({ tenant, body }) => {
    try {
      const result = await saveDishRecipes(tenant, body.menuItemId, body.version, body.recipes)
      if (result.written > 0) {
        revalidatePath(`/${body.tenantSlug}/admin/inventory`)
        // Diners' stock ceilings read recipes: a changed size recipe changes them.
        await invalidateStockCeilings(tenant)
      }
      return NextResponse.json({ success: true, data: result }, { headers: NO_STORE })
    } catch (error) {
      if (error instanceof z.ZodError) return fail(400, 'Some amounts could not be read. Check them and save again.')
      return failure(error, 'save')
    }
  },
})
