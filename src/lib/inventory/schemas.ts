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
})

export type RecipeInput = z.infer<typeof recipeInputSchema>
