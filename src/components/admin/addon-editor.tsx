'use client'

import type { ReactNode } from 'react'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import { AddRowButton, OptionList, OptionRow } from '@/components/admin/menu-editor/option-rows'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'
import { RecipeDisclosure } from '@/components/admin/recipe-disclosure'

interface Addon {
  id: string
  name: string
  price: number
}

interface AddonEditorProps {
  addons: Addon[]
  onAddAddon: () => void
  onRemoveAddon: (index: number) => void
  onUpdateAddon: (index: number, field: string, value: string | number | boolean) => void
  // Optional slot for extra header controls (e.g. the library picker).
  headerAction?: ReactNode
  /**
   * Enables a per-addon recipe control. Omitted by callers that do not have
   * inventory, so this component renders exactly as before for them.
   */
  recipeContext?: AddonRecipeContext
}

/**
 * What an addon needs before a recipe can be attached to it. `menuItemId` is
 * undefined for an unsaved item — recipes key on it, so the control stays hidden
 * until the item exists.
 */
export interface AddonRecipeContext {
  tenantId: string
  tenantSlug: string
  menuItemId?: string
  inventoryEnabled: boolean
  onRecipeSaved?: () => void
}

export function AddonEditor({
  addons,
  onAddAddon,
  onRemoveAddon,
  onUpdateAddon,
  headerAction,
  recipeContext,
}: AddonEditorProps) {
  const canAttachRecipe = Boolean(recipeContext?.inventoryEnabled && recipeContext.menuItemId)
  return (
    <EditorSection
      id={DISH_SECTION_IDS.addons}
      title="Add-ons"
      meta={addons.length > 0 ? String(addons.length) : undefined}
      description="Extras customers can add on top — they can pick as many as they like. Leave the price empty for a free one."
      action={headerAction}
    >
      <div className="space-y-3">
        {addons.length > 0 && (
          <OptionList>
            {addons.map((addon, index) => (
              <OptionRow
                key={addon.id}
                name={addon.name}
                onNameChange={(name) => onUpdateAddon(index, 'name', name)}
                nameLabel="Add-on name"
                namePlaceholder="e.g. Extra cheese, Extra rice"
                price={addon.price}
                onPriceChange={(price) => onUpdateAddon(index, 'price', price)}
                priceLabel="Price"
                pricePrefix="₱"
                onRemove={() => onRemoveAddon(index)}
                footer={canAttachRecipe && recipeContext?.menuItemId && (
                  /*
                   * Behind a disclosure, not mounted outright: each editor
                   * fires three server actions on mount, two of them reading
                   * the tenant's whole ingredient and unit catalogs, and Next
                   * runs server actions one at a time. A dish with eight
                   * add-ons was queueing two dozen sequential round trips
                   * before the merchant could touch anything.
                   */
                  <RecipeDisclosure
                    tenantId={recipeContext.tenantId}
                    tenantSlug={recipeContext.tenantSlug}
                    target={{
                      type: 'addon',
                      menuItemId: recipeContext.menuItemId,
                      addonId: addon.id,
                    }}
                    label={`Recipe for ${addon.name || 'this add-on'}`}
                    onSaved={recipeContext.onRecipeSaved}
                  />
                )}
              />
            ))}
          </OptionList>
        )}
        <AddRowButton label={addons.length > 0 ? 'Add another add-on' : 'Add an add-on'} onClick={onAddAddon} />
      </div>
    </EditorSection>
  )
}
