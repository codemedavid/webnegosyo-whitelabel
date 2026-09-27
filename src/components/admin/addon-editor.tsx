'use client'

import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
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
      title="Add-ons"
      description="Extras customers can add, like Extra cheese. Enter 0 for a free add-on."
      action={
        <>
          {headerAction}
          <Button type="button" variant="outline" size="sm" onClick={onAddAddon}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add add-on
          </Button>
        </>
      }
    >
        {addons.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            No add-ons yet. Add extras like Extra cheese or No onions.
          </p>
        ) : (
          <div className="space-y-3">
            {addons.map((addon, index) => (
              <div key={addon.id} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Name, e.g. Extra cheese"
                  aria-label="Add-on name"
                  value={addon.name}
                  onChange={(e) => onUpdateAddon(index, 'name', e.target.value)}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="₱0"
                  aria-label="Add-on price"
                  className="w-28 shrink-0"
                  value={addon.price}
                  onChange={(e) => onUpdateAddon(index, 'price', parseFloat(e.target.value))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveAddon(index)}
                  aria-label={`Remove ${addon.name || 'add-on'}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {canAttachRecipe && recipeContext?.menuItemId && (
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
              </div>
            ))}
          </div>
        )}
    </EditorSection>
  )
}
