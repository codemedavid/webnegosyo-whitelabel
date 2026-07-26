'use client'

import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RecipeEditor } from '@/components/admin/recipe-editor'

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Add-ons</CardTitle>
        <div className="flex items-center gap-2">
          {headerAction}
          <Button type="button" variant="outline" size="sm" onClick={onAddAddon}>
            <Plus className="mr-2 h-4 w-4" />
            Add Add-on
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {addons.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No add-ons. Add extras like Extra Cheese, No Onions.
          </p>
        ) : (
          <div className="space-y-3">
            {addons.map((addon, index) => (
              <div key={addon.id} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Name (e.g., Extra Cheese)"
                  value={addon.name}
                  onChange={(e) => onUpdateAddon(index, 'name', e.target.value)}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={addon.price}
                  onChange={(e) => onUpdateAddon(index, 'price', parseFloat(e.target.value))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveAddon(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {canAttachRecipe && recipeContext?.menuItemId && (
                <RecipeEditor
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
      </CardContent>
    </Card>
  )
}
