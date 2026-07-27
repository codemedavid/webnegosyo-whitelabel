'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChefHat, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Table, proportional, pixel } from '@astryxdesign/core/Table'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { IngredientDialog } from '@/components/admin/inventory/ingredient-dialog'
import { StockDialog } from '@/components/admin/inventory/stock-dialog'
import { StockLevelCell } from '@/components/admin/inventory/stock-level-cell'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

/** Astryx's Table constrains its rows to `Record<string, unknown>`. */
type IngredientRow = InventoryItem & Record<string, unknown>
import {
  EMPTY_STOCK_DRAFT,
  buildStockMovementInput,
  type StockMovementDraft,
} from '@/lib/inventory/stock-form'
import {
  EMPTY_INGREDIENT_DRAFT,
  buildIngredientInput,
  ingredientToDraft,
  type IngredientDraft,
} from '@/lib/inventory/inventory-form'
import {
  createIngredientAction,
  updateIngredientAction,
  deleteIngredientAction,
  recordStockMovementAction,
} from '@/app/actions/inventory'

interface IngredientsTabProps {
  tenantId: string
  tenantSlug: string
  ingredients: InventoryItem[]
  units: InventoryUnitRow[]
  onChange: (next: InventoryItem[]) => void
}

/**
 * The ingredient shelf as a table.
 *
 * The shadcn original gave every ingredient its own Card. Astryx's guidance is
 * explicit that dense uniform data belongs in edge-to-edge rows, and it reads
 * better: twenty ingredients can be scanned down a column instead of parsed
 * card by card.
 */
export function IngredientsTab({
  tenantId,
  tenantSlug,
  ingredients,
  units,
  onChange,
}: IngredientsTabProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<IngredientDraft>(EMPTY_INGREDIENT_DRAFT)
  const [isSaving, setIsSaving] = useState(false)
  // One prep's recipe open at a time — each editor is a separate data load.
  const [recipeItem, setRecipeItem] = useState<InventoryItem | null>(null)
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null)
  const [stockDraft, setStockDraft] = useState<StockMovementDraft>(EMPTY_STOCK_DRAFT)
  const [isRecording, setIsRecording] = useState(false)

  const unitLabel = (unitId: string) => units.find((u) => u.id === unitId)?.abbreviation ?? '—'

  const openStock = (item: InventoryItem) => {
    setStockItem(item)
    // Default to the unit the ingredient is stocked in — the common case, and
    // the only one that needs no conversion.
    setStockDraft({ ...EMPTY_STOCK_DRAFT, unit_id: item.stock_unit_id })
  }

  const openCreate = () => {
    setEditingId(null)
    setDraft({ ...EMPTY_INGREDIENT_DRAFT, stock_unit_id: units[0]?.id ?? '' })
    setIsOpen(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditingId(item.id)
    setDraft(ingredientToDraft(item))
    setIsOpen(true)
  }

  const handleSave = async () => {
    let input
    try {
      input = buildIngredientInput(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsSaving(true)
    try {
      const result = editingId
        ? await updateIngredientAction(editingId, tenantId, tenantSlug, input)
        : await createIngredientAction(tenantId, tenantSlug, input)

      if (!result.success) {
        toast.error(result.error ?? 'Failed to save ingredient')
        return
      }

      const saved = result.data
      onChange(
        editingId
          ? ingredients.map((i) => (i.id === editingId ? saved : i))
          : [...ingredients, saved],
      )
      toast.success(editingId ? 'Ingredient updated' : 'Ingredient added')
      setIsOpen(false)
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  const handleRecordStock = async () => {
    if (!stockItem) return
    let input
    try {
      input = buildStockMovementInput(stockDraft, stockItem.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Please check the form')
      return
    }

    setIsRecording(true)
    try {
      const result = await recordStockMovementAction(tenantId, tenantSlug, input)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to record stock movement')
        return
      }
      // The server's figure replaces ours: a stale local total is exactly the
      // bug the ledger exists to prevent.
      const saved = result.data.item
      onChange(ingredients.map((i) => (i.id === saved.id ? saved : i)))
      toast.success('Stock updated')
      setStockItem(null)
      router.refresh()
    } finally {
      setIsRecording(false)
    }
  }

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`Delete "${item.name}"? Recipes using it will lose this line.`)) return
    const result = await deleteIngredientAction(item.id, tenantId, tenantSlug)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete ingredient')
      return
    }
    onChange(ingredients.filter((i) => i.id !== item.id))
    toast.success('Ingredient deleted')
    router.refresh()
  }

  const noUnits = units.length === 0

  const columns = [
    {
      key: 'name',
      header: 'Ingredient',
      width: proportional(2),
      renderCell: (item: IngredientRow) => (
        <HStack gap={1.5} vAlign="center">
          <Text type="body" weight="semibold">{item.name}</Text>
          {item.is_prep && <Badge variant="purple" label="Prep" />}
          {!item.is_active && <Badge variant="neutral" label="Inactive" />}
        </HStack>
      ),
    },
    {
      key: 'current_qty',
      header: 'On hand',
      width: proportional(1),
      renderCell: (item: IngredientRow) => (
        <StockLevelCell item={item} unitAbbreviation={unitLabel(item.stock_unit_id)} />
      ),
    },
    {
      key: 'unit_cost',
      header: 'Cost',
      width: proportional(1),
      renderCell: (item: IngredientRow) => (
        <Text type="body" color="secondary">
          {`₱${item.unit_cost.toFixed(2)} / ${unitLabel(item.stock_unit_id)}`}
        </Text>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: proportional(1),
      renderCell: (item: IngredientRow) => (
        <Text type="body" color="secondary">
          {item.category || '—'}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: pixel(240),
      align: 'end' as const,
      renderCell: (item: IngredientRow) => (
        <HStack gap={1} justify="end">
          <Button
            label={`Record stock for ${item.name}`}
            isIconOnly
            size="sm"
            onClick={() => openStock(item)}
            icon={<PackagePlus size={16} />}
          />
          {item.is_prep && (
            <Button
              label={`Recipe for ${item.name}`}
              isIconOnly
              size="sm"
              onClick={() => setRecipeItem(item)}
              icon={<ChefHat size={16} />}
            />
          )}
          <Button
            label={`Edit ${item.name}`}
            isIconOnly
            size="sm"
            variant="ghost"
            onClick={() => openEdit(item)}
            icon={<Pencil size={16} />}
          />
          <Button
            label={`Delete ${item.name}`}
            isIconOnly
            size="sm"
            variant="ghost"
            onClick={() => handleDelete(item)}
            icon={<Trash2 size={16} />}
          />
        </HStack>
      ),
    },
  ]

  return (
    <VStack gap={4}>
      <HStack justify="end">
        <Button
          label="New Ingredient"
          variant="primary"
          onClick={openCreate}
          isDisabled={noUnits}
          tooltip="Add a unit of measure first — ingredients are priced per unit."
          icon={<Plus size={16} />}
        />
      </HStack>

      {noUnits && (
        <Banner
          status="warning"
          title="Add at least one unit of measure first"
          description="Ingredients are priced per unit, so the form cannot be filled in without one."
        />
      )}

      {ingredients.length === 0 ? (
        <Banner
          status="info"
          title="No ingredients yet"
          description="Add raw materials (flour, cheese) or prep items to build recipes and track cost."
        />
      ) : (
        <Table
          data={ingredients as IngredientRow[]}
          columns={columns}
          idKey="id"
          density="balanced"
          dividers="rows"
          hasHover
          textOverflow="truncate"
        />
      )}

      <IngredientDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        isEditing={editingId !== null}
        draft={draft}
        setDraft={setDraft}
        units={units}
        isSaving={isSaving}
        onSave={handleSave}
      />

      <StockDialog
        tenantId={tenantId}
        item={stockItem}
        units={units}
        unitLabel={unitLabel}
        draft={stockDraft}
        setDraft={setStockDraft}
        isRecording={isRecording}
        onClose={() => setStockItem(null)}
        onRecord={handleRecordStock}
      />

      {/* The recipe was an inline row expansion before; a table row cannot hold
          an editor, and a dialog also stops the editor loading its ingredients
          and recipe until the merchant actually asks for it. */}
      <Dialog
        isOpen={recipeItem !== null}
        onOpenChange={(open) => !open && setRecipeItem(null)}
        width={720}
        purpose="info"
      >
        <DialogHeader
          title={recipeItem ? `What ${recipeItem.name} is made of` : 'Recipe'}
          onOpenChange={(open) => !open && setRecipeItem(null)}
        />
        <VStack padding={4}>
          {recipeItem && (
            <RecipeEditor
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              target={{ type: 'prep_item', prepItemId: recipeItem.id }}
              label={`What ${recipeItem.name} is made of`}
              onSaved={() => router.refresh()}
            />
          )}
        </VStack>
      </Dialog>
    </VStack>
  )
}
