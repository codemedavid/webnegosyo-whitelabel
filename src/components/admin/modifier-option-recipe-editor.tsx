'use client'

import { RecipeEditor } from '@/components/admin/recipe-editor'

interface ModifierOptionRecipeEditorProps {
  tenantId: string
  tenantSlug: string
  menuItemId: string
  modifierOptionId: string
  /** Fired after a successful save, so the option's cost display can refresh. */
  onSaved?: () => void
}

/**
 * Recipe-attach control for a unified modifier option.
 *
 * A thin wrapper over the target-generic `RecipeEditor` — it exists only to name
 * the target. The editing, loading, and persistence logic is shared with every
 * other costable target rather than duplicated per call site.
 */
export function ModifierOptionRecipeEditor({
  tenantId,
  tenantSlug,
  menuItemId,
  modifierOptionId,
  onSaved,
}: ModifierOptionRecipeEditorProps) {
  return (
    <RecipeEditor
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      target={{ type: 'modifier_option', menuItemId, modifierOptionId }}
      onSaved={onSaved}
    />
  )
}
