'use client'

import { RecipeDisclosure } from '@/components/admin/recipe-disclosure'

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
 * A thin wrapper over the target-generic editor — it exists only to name the
 * target. Collapsed by default, like the add-on rows: every option that could
 * take a recipe used to mount its own editor and fire three server actions
 * before the merchant had touched anything.
 */
export function ModifierOptionRecipeEditor({
  tenantId,
  tenantSlug,
  menuItemId,
  modifierOptionId,
  onSaved,
}: ModifierOptionRecipeEditorProps) {
  return (
    <RecipeDisclosure
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      target={{ type: 'modifier_option', menuItemId, modifierOptionId }}
      label="Recipe (ingredients used per sale)"
      onSaved={onSaved}
    />
  )
}
