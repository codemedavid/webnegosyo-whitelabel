/**
 * Branding Studio "Menu Layout" surface — category draft logic.
 *
 * Pure helpers shared by the editor (builds the draft + publish plan) and the
 * storefront preview (applies the draft over the server-provided categories).
 * The draft travels to the preview iframe under the `__categoryDraft` meta key
 * of the existing branding postMessage payload (see use-branding-preview.ts).
 */

import type { Category } from '@/types/database'
import type { CategoryInput } from '@/lib/admin-service'

export interface CategoryStudioOverride {
  display_layout?: Category['display_layout']
  /** Empty string clears the override back to "inherit store template". */
  card_template?: string
}

export interface CategoryStudioDraft {
  /** Full or partial id ordering; listed ids come first, the rest keep their saved order. */
  order?: string[]
  /** Per-category unsaved field edits, keyed by category id. */
  overrides?: Record<string, CategoryStudioOverride>
}

export interface CategoryPublishPlan {
  /** Full id list for reorderCategoriesAction, or null when the order is unchanged. */
  orderedIds: string[] | null
  /** Full CategoryInput per modified category (partial inputs would let schema defaults clobber columns). */
  updates: Array<{ id: string; input: CategoryInput }>
}

export function hasCategoryDraftChanges(draft: CategoryStudioDraft): boolean {
  return (draft.order?.length ?? 0) > 0 || Object.keys(draft.overrides ?? {}).length > 0
}

function applyOverride(category: Category, override: CategoryStudioOverride | undefined): Category {
  if (!override) return category
  const next = { ...category }
  if (override.display_layout !== undefined) next.display_layout = override.display_layout
  if (override.card_template !== undefined) {
    next.card_template = override.card_template === '' ? null : override.card_template
  }
  return next
}

function orderCategories(categories: Category[], order: string[] | undefined): Category[] {
  if (!order || order.length === 0) return categories
  const byId = new Map(categories.map((c) => [c.id, c]))
  const ordered = order
    .filter((id) => byId.has(id))
    .map((id) => byId.get(id) as Category)
  const orderedIds = new Set(ordered.map((c) => c.id))
  const rest = categories.filter((c) => !orderedIds.has(c.id))
  return [...ordered, ...rest]
}

/** The categories as the preview should render them: reordered + overridden. */
export function applyCategoryDraft(
  categories: Category[],
  draft: CategoryStudioDraft | null | undefined
): Category[] {
  if (!draft || !hasCategoryDraftChanges(draft)) return categories
  const withOverrides = categories.map((c) => applyOverride(c, draft.overrides?.[c.id]))
  return orderCategories(withOverrides, draft.order)
}

/** Full update input from a saved category so unmentioned columns keep their values. */
function toCategoryInput(category: Category): CategoryInput {
  return {
    name: category.name,
    description: category.description ?? undefined,
    icon: category.icon ?? undefined,
    icon_color: category.icon_color ?? undefined,
    order: category.order,
    is_active: category.is_active,
    display_layout: category.display_layout ?? 'grid',
    card_template: category.card_template ?? null,
    default_addons: category.default_addons ?? [],
  }
}

function isOverrideEffective(category: Category, override: CategoryStudioOverride): boolean {
  if (
    override.display_layout !== undefined &&
    override.display_layout !== (category.display_layout ?? 'grid')
  ) {
    return true
  }
  if (override.card_template !== undefined) {
    const nextTemplate = override.card_template === '' ? null : override.card_template
    if (nextTemplate !== (category.card_template ?? null)) return true
  }
  return false
}

/** Turns the unsaved draft into the reorder + per-category update calls Publish should run. */
export function buildCategoryPublishPlan(
  categories: Category[],
  draft: CategoryStudioDraft
): CategoryPublishPlan {
  const applied = applyCategoryDraft(categories, draft)
  const savedIds = categories.map((c) => c.id)
  const appliedIds = applied.map((c) => c.id)
  const orderChanged = appliedIds.some((id, index) => id !== savedIds[index])

  const updates = categories
    .map((category) => {
      const override = draft.overrides?.[category.id]
      if (!override || !isOverrideEffective(category, override)) return null
      return {
        id: category.id,
        input: toCategoryInput(applyOverride(category, override)),
      }
    })
    .filter((update): update is { id: string; input: CategoryInput } => update !== null)

  return { orderedIds: orderChanged ? appliedIds : null, updates }
}
