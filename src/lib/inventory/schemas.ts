/**
 * Pure Zod input schemas for the inventory domain (units, ingredients,
 * recipes). This module has NO server-only dependencies so it can be imported
 * by client-side form helpers and 'use client' components without pulling the
 * server-backed inventory services (which import '@/lib/supabase/server' and
 * '@/lib/admin-service') into the client bundle.
 *
 * The services re-export these schemas to keep their public API stable.
 */
import { z } from 'zod'

export const unitInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  abbreviation: z.string().trim().min(1, 'Abbreviation is required'),
  dimension: z.enum(['weight', 'volume', 'count']),
  to_base_factor: z.number().positive('Conversion factor must be greater than zero'),
  is_base: z.boolean().default(false),
  is_active: z.boolean().default(true),
})

export type UnitInput = z.infer<typeof unitInputSchema>

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  stock_unit_id: z.string().uuid('A stock unit is required'),
  unit_cost: z.number().min(0, 'Unit cost cannot be negative').default(0),
  is_prep: z.boolean().default(false),
  image_url: z.string().url().optional().nullable(),
  reorder_level: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
})

export type IngredientInput = z.infer<typeof ingredientInputSchema>

export const recipeComponentInputSchema = z.object({
  inventory_item_id: z.string().uuid('An ingredient is required'),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  unit_id: z.string().uuid('A unit is required'),
})

export type RecipeComponentInput = z.infer<typeof recipeComponentInputSchema>

export const recipeInputSchema = z.object({
  notes: z.string().trim().optional().nullable(),
  components: z.array(recipeComponentInputSchema),
  /**
   * How much a prep recipe makes. Only prep-item recipes carry a yield — it is
   * what turns a batch cost into a per-unit cost — so both fields are optional
   * and every non-prep target omits them.
   */
  yield_quantity: z.number().positive('Yield must be greater than zero').optional(),
  yield_unit_id: z.string().uuid('A yield unit is required').optional(),
})

export type RecipeInput = z.infer<typeof recipeInputSchema>

/**
 * One stock movement as the client sends it: a magnitude, a unit and a reason.
 * The signed delta is derived server-side from the item's current quantity —
 * the client's copy can be stale, and two staff receiving stock at once would
 * otherwise each write a total based on what they last saw.
 */
export const stockMovementInputSchema = z.object({
  inventory_item_id: z.string().uuid('An ingredient is required'),
  reason: z.enum(['receive', 'stocktake', 'waste', 'sale', 'void']),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  unit_id: z.string().uuid('A unit is required'),
  /** Delivery price per unit. Omitted means "unchanged", never "free". */
  unit_cost: z.number().min(0).optional(),
  note: z.string().trim().optional(),
  order_id: z.string().uuid().optional(),
  /**
   * Branch this movement lands in. Absent means "wherever the author's own
   * scope puts it" — the store pool for an owner, their own branch for a
   * manager. Never trusted as sent: `resolveMovementBranch` re-checks it
   * against the author's scope before anything is written.
   */
  outlet_id: z.string().uuid().nullable().optional(),
  /**
   * The count session this movement was performed under, when it was performed
   * under one. Absent for every one-off correction, and for everything written
   * before sessions existed.
   */
  inventory_count_id: z.string().uuid().optional(),
}).superRefine((input, ctx) => {
  // Only a stocktake may name a session. A delivery filed under a count would
  // raise that count's coverage for an ingredient nobody counted — the exact
  // reassurance the session exists to withhold.
  //
  // The database enforces this too, in `stock_movement_count_session_is_valid`.
  // It is repeated here so the merchant gets a sentence instead of a Postgres
  // exception, not because either layer is redundant: this one can be bypassed
  // by any other writer, and that one cannot explain itself.
  if (input.inventory_count_id !== undefined && input.reason !== 'stocktake') {
    ctx.addIssue({
      code: 'custom',
      path: ['inventory_count_id'],
      message: 'Only a stock count entry can belong to a stock count',
    })
  }
})

export type StockMovementInput = z.infer<typeof stockMovementInputSchema>
