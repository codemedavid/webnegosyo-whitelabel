'use client'

import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Button } from '@astryxdesign/core/Button'
import type { IngredientDraft } from '@/lib/inventory/inventory-form'
import type { InventoryUnitRow } from '@/types/database'

/**
 * The draft keeps every field as a string because `buildIngredientInput` parses
 * and validates them (an empty box must stay empty, not become 0). NumberInput
 * speaks numbers, so it is bridged here rather than loosening the pure form
 * module that the tests for it already pin.
 */
function toNumber(value: string): number | null {
  return value === '' ? null : Number(value)
}

interface IngredientDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isEditing: boolean
  draft: IngredientDraft
  setDraft: (update: (draft: IngredientDraft) => IngredientDraft) => void
  units: InventoryUnitRow[]
  isSaving: boolean
  onSave: () => void
}

export function IngredientDialog({
  isOpen,
  onOpenChange,
  isEditing,
  draft,
  setDraft,
  units,
  isSaving,
  onSave,
}: IngredientDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={520} purpose="form">
      <DialogHeader
        title={isEditing ? 'Edit Ingredient' : 'New Ingredient'}
        subtitle="What it costs and how it is measured"
        onOpenChange={onOpenChange}
      />

      <VStack gap={3} padding={4}>
        <TextInput
          label="Name"
          placeholder="e.g., Mozzarella"
          value={draft.name}
          onChange={(value) => setDraft((d) => ({ ...d, name: value }))}
          isRequired
        />

        <HStack gap={3}>
          <NumberInput
            label="Unit cost (₱)"
            value={toNumber(draft.unit_cost)}
            onChange={(value) => setDraft((d) => ({ ...d, unit_cost: String(value) }))}
            min={0}
            step={0.01}
            placeholder="0.00"
          />
          <Selector
            label="Stock unit"
            placeholder="Select a unit"
            value={draft.stock_unit_id || undefined}
            onChange={(value) => setDraft((d) => ({ ...d, stock_unit_id: value }))}
            options={units.map((unit) => ({
              value: unit.id,
              label: `${unit.name} (${unit.abbreviation})`,
            }))}
          />
        </HStack>

        <HStack gap={3}>
          <TextInput
            label="SKU"
            value={draft.sku}
            onChange={(value) => setDraft((d) => ({ ...d, sku: value }))}
            isOptional
          />
          <TextInput
            label="Category"
            placeholder="e.g., Dairy"
            value={draft.category}
            onChange={(value) => setDraft((d) => ({ ...d, category: value }))}
            isOptional
          />
        </HStack>

        <NumberInput
          label="Reorder level"
          description="Below this, the ingredient is flagged as running low. Leave at 0 to never be warned."
          value={toNumber(draft.reorder_level)}
          onChange={(value) => setDraft((d) => ({ ...d, reorder_level: String(value) }))}
          min={0}
          placeholder="0"
        />

        <HStack gap={6}>
          <CheckboxInput
            label="Prep item (made in-house)"
            value={draft.is_prep}
            onChange={(checked) => setDraft((d) => ({ ...d, is_prep: checked }))}
          />
          <CheckboxInput
            label="Active"
            value={draft.is_active}
            onChange={(checked) => setDraft((d) => ({ ...d, is_active: checked }))}
          />
        </HStack>

        <HStack gap={2} justify="end">
          <Button
            label="Cancel"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            isDisabled={isSaving}
          />
          <Button
            label={isEditing ? 'Save Changes' : 'Add Ingredient'}
            variant="primary"
            onClick={onSave}
            isLoading={isSaving}
          />
        </HStack>
      </VStack>
    </Dialog>
  )
}
