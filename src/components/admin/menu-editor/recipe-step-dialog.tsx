'use client'

/**
 * The recipe step for a freshly created dish on an inventory store. Dismissing
 * it in any way — Done, Skip, the close button — moves on either way; the
 * dialog only decides whether the dish leaves linked to inventory. Until it
 * has a recipe, selling it deducts no stock.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RecipeEditor } from '@/components/admin/recipe-editor'

interface RecipeStepDialogProps {
  tenantId: string
  tenantSlug: string
  /** The dish just created; null keeps the dialog closed. */
  itemId: string | null
  dishName: string
  onFinish: () => void
}

export function RecipeStepDialog({ tenantId, tenantSlug, itemId, dishName, onFinish }: RecipeStepDialogProps) {
  const [isSaving, setIsSaving] = useState(false)
  const finish = () => {
    if (!isSaving) onFinish()
  }

  return (
    <Dialog open={itemId !== null} onOpenChange={(open) => !open && finish()}>
      <DialogContent
        className="max-h-[85dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-y-auto"
        showCloseButton={!isSaving}
      >
        <DialogHeader>
          <DialogTitle>Link ingredients now?</DialogTitle>
          <DialogDescription>
            {dishName || 'This dish'} is saved. Until it has a recipe, selling it will not
            deduct any stock from your inventory.
          </DialogDescription>
        </DialogHeader>
        {itemId && (
          <RecipeEditor
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            target={{ type: 'menu_item', menuItemId: itemId }}
            label="Ingredients used per order"
            onSavingChange={setIsSaving}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="max-sm:h-11" onClick={finish} disabled={isSaving}>
            Skip for now
          </Button>
          <Button type="button" className="max-sm:h-11" onClick={finish} disabled={isSaving}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
