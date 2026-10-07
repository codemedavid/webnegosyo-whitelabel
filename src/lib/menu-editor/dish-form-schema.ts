/**
 * Client-side rules for the dish editor's required fields. The server applies
 * the same rules (`menuItemSchema` in admin-service.ts); the limits both read
 * live in `dish-limits.ts`.
 */

import { z } from 'zod'
import { DISH_DESCRIPTION_MAX, DISH_NAME_MIN } from '@/lib/menu-editor/dish-limits'

export interface DishBasics {
  name: string
  description: string
  price: string
  discounted_price: string
  image_url: string
  category_id: string
}

export type DishBasicsErrors = Partial<Record<keyof DishBasics, string>>

export const dishFormSchema = z.object({
  name: z.string().trim().min(DISH_NAME_MIN, `Give the dish a name (at least ${DISH_NAME_MIN} letters).`),
  description: z.string().max(DISH_DESCRIPTION_MAX, `Keep the description under ${DISH_DESCRIPTION_MAX} characters.`),
  price: z.string().refine((val) => {
    const num = parseFloat(val)
    return Number.isFinite(num) && num >= 0
  }, 'Enter a price. Use 0 for a free item.'),
  discounted_price: z.string().optional().refine((val) => {
    if (!val) return true
    const num = parseFloat(val)
    return !isNaN(num) && num >= 0
  }, 'Sale price must be 0 or more, or left empty.'),
  // Optional — a valid URL or an empty string (no photo).
  image_url: z.string().url('That photo link is not valid. Upload it again.').or(z.literal('')),
  category_id: z.string().uuid('Choose a category.'),
})

export function errorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): DishBasicsErrors {
  const next: DishBasicsErrors = {}
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && !(field in next)) next[field as keyof DishBasics] = issue.message
  }
  return next
}

/** Which required fields are still unfilled or invalid, split the way the editor's sections are. */
export function describeMissingFields(basics: DishBasics): { detailCount: number; isPriceMissing: boolean } {
  const parsed = dishFormSchema.safeParse(basics)
  if (parsed.success) return { detailCount: 0, isPriceMissing: false }
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]))
  const isPriceMissing = fields.has('price') || fields.has('discounted_price')
  fields.delete('price')
  fields.delete('discounted_price')
  return { detailCount: fields.size, isPriceMissing }
}

/** The category a new dish starts in: the one asked for, or the only one there is. */
export function initialCategoryId(
  categories: readonly { id: string }[],
  requested: string | undefined,
): string {
  if (requested && categories.some((category) => category.id === requested)) return requested
  return categories.length === 1 ? categories[0].id : ''
}
