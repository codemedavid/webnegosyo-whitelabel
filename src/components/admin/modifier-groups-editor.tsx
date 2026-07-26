'use client'

import type { ReactNode } from 'react'
import { Library, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ImageUpload } from '@/components/shared/image-upload'
import type { CostMode, ModifierGroup, ModifierOption, ModifierStockMode } from '@/types/database'
import {
  createModifierGroup,
  createModifierOption,
  isSingleSelectGroup,
  setGroupMultiple,
  setGroupRequired,
  setOptionCostMode,
} from '@/lib/modifier-groups-form'
import { computeOptionMargin } from '@/lib/modifier-margin'
import { ModifierOptionRecipeEditor } from '@/components/admin/modifier-option-recipe-editor'

/**
 * Context needed to attach an inventory recipe to a recipe-stock option.
 * `menuItemId` is undefined for a not-yet-saved item — recipes key on it, so the
 * attach control is disabled with a hint until the item is saved once.
 */
export interface ModifierRecipeContext {
  tenantId: string
  tenantSlug: string
  menuItemId?: string
  inventoryEnabled: boolean
}

interface ModifierGroupsEditorProps {
  groups: ModifierGroup[]
  onChange: (groups: ModifierGroup[]) => void
  /** Base item price, used for live per-option margin. */
  basePrice: number
  /** Enables the per-option recipe-attach control when inventory is on. */
  recipeContext?: ModifierRecipeContext
  /**
   * Recipe-derived cost per modifier option id, keyed as in
   * `MenuItemCostBreakdown.modifierOptionCosts`. Supplied by the page container
   * (which owns the server action) so this editor stays presentational.
   */
  optionRecipeCosts?: Record<string, number>
  /** Optional slot rendered beside "Add Group" (e.g. the library picker). */
  headerAction?: ReactNode
  /** When provided, each group card gets a "Save to library" control. */
  onSaveGroupToLibrary?: (group: ModifierGroup) => void
}

/**
 * Unified editor for Modifier Groups — the single control that replaces the
 * separate Variation Types and Add-ons editors. Each group has selection rules
 * (required, single/multi) and each option carries a price modifier plus
 * optional per-option cost and stock. State is owned by the parent form; this
 * component is presentational and mutates immutably through `onChange`.
 */
export function ModifierGroupsEditor({ groups, onChange, basePrice, recipeContext, optionRecipeCosts, headerAction, onSaveGroupToLibrary }: ModifierGroupsEditorProps) {
  const addGroup = () => {
    onChange([...groups, createModifierGroup(`grp-${Date.now()}`, groups.length)])
  }

  const removeGroup = (groupIndex: number) => {
    onChange(groups.filter((_, i) => i !== groupIndex))
  }

  const replaceGroup = (groupIndex: number, next: ModifierGroup) => {
    onChange(groups.map((g, i) => (i === groupIndex ? next : g)))
  }

  const updateGroupField = <K extends keyof ModifierGroup>(
    groupIndex: number,
    field: K,
    value: ModifierGroup[K],
  ) => {
    replaceGroup(groupIndex, { ...groups[groupIndex], [field]: value })
  }

  const addOption = (groupIndex: number) => {
    const group = groups[groupIndex]
    const next = {
      ...group,
      options: [...group.options, createModifierOption(`opt-${Date.now()}`, group.options.length)],
    }
    replaceGroup(groupIndex, next)
  }

  const removeOption = (groupIndex: number, optionIndex: number) => {
    const group = groups[groupIndex]
    replaceGroup(groupIndex, {
      ...group,
      options: group.options.filter((_, i) => i !== optionIndex),
    })
  }

  const updateOption = <K extends keyof ModifierOption>(
    groupIndex: number,
    optionIndex: number,
    field: K,
    value: ModifierOption[K],
  ) => {
    const group = groups[groupIndex]
    replaceGroup(groupIndex, {
      ...group,
      options: group.options.map((o, i) => (i === optionIndex ? { ...o, [field]: value } : o)),
    })
  }

  const replaceOption = (groupIndex: number, optionIndex: number, next: ModifierOption) => {
    const group = groups[groupIndex]
    replaceGroup(groupIndex, {
      ...group,
      options: group.options.map((o, i) => (i === optionIndex ? next : o)),
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Modifier Groups</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Variations and add-ons in one place. Set selection rules per group and cost/stock per
            option.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <Button type="button" variant="outline" size="sm" onClick={addGroup}>
            <Plus className="mr-2 h-4 w-4" />
            Add Group
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No modifier groups. Add a group like Size (single-select) or Extras (multi-select).
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group, groupIndex) => (
              <ModifierGroupCard
                key={group.id}
                group={group}
                basePrice={basePrice}
                recipeContext={recipeContext}
                optionRecipeCosts={optionRecipeCosts}
                onSaveToLibrary={onSaveGroupToLibrary ? () => onSaveGroupToLibrary(group) : undefined}
                onRemoveGroup={() => removeGroup(groupIndex)}
                onUpdateName={(name) => updateGroupField(groupIndex, 'name', name)}
                onToggleRequired={(required) => replaceGroup(groupIndex, setGroupRequired(group, required))}
                onToggleMultiple={(multiple) => replaceGroup(groupIndex, setGroupMultiple(group, multiple))}
                onUpdateMaxSelect={(max) => updateGroupField(groupIndex, 'max_select', max)}
                onAddOption={() => addOption(groupIndex)}
                onRemoveOption={(optionIndex) => removeOption(groupIndex, optionIndex)}
                onUpdateOption={(optionIndex, field, value) =>
                  updateOption(groupIndex, optionIndex, field, value)
                }
                onReplaceOption={(optionIndex, next) => replaceOption(groupIndex, optionIndex, next)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ModifierGroupCardProps {
  group: ModifierGroup
  basePrice: number
  recipeContext?: ModifierRecipeContext
  optionRecipeCosts?: Record<string, number>
  onSaveToLibrary?: () => void
  onRemoveGroup: () => void
  onUpdateName: (name: string) => void
  onToggleRequired: (required: boolean) => void
  onToggleMultiple: (multiple: boolean) => void
  onUpdateMaxSelect: (max: number | null) => void
  onAddOption: () => void
  onRemoveOption: (optionIndex: number) => void
  onUpdateOption: <K extends keyof ModifierOption>(
    optionIndex: number,
    field: K,
    value: ModifierOption[K],
  ) => void
  onReplaceOption: (optionIndex: number, next: ModifierOption) => void
}

function ModifierGroupCard({
  group,
  basePrice,
  recipeContext,
  optionRecipeCosts,
  onSaveToLibrary,
  onRemoveGroup,
  onUpdateName,
  onToggleRequired,
  onToggleMultiple,
  onUpdateMaxSelect,
  onAddOption,
  onRemoveOption,
  onUpdateOption,
  onReplaceOption,
}: ModifierGroupCardProps) {
  const isSingle = isSingleSelectGroup(group)
  const isRequired = group.min_select >= 1

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-3">
          <Input
            placeholder="Group name (e.g., Size, Extras)"
            value={group.name}
            onChange={(e) => onUpdateName(e.target.value)}
            className="font-medium"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => onToggleRequired(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">Required</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!isSingle}
                onChange={(e) => onToggleMultiple(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">Allow multiple</span>
            </label>
            {!isSingle && (
              <label className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Max</span>
                <Input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={group.max_select ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    onUpdateMaxSelect(raw === '' ? null : Math.max(1, parseInt(raw, 10) || 1))
                  }}
                  className="w-20"
                />
              </label>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onSaveToLibrary && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSaveToLibrary}
              title="Save this group as reusable in your library"
            >
              <Library className="mr-1 h-4 w-4" />
              Save to library
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemoveGroup}
            className="text-red-500 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="ml-4 space-y-3 border-l-2 pl-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-muted-foreground">Options</h4>
          <Button type="button" variant="outline" size="sm" onClick={onAddOption}>
            <Plus className="mr-1 h-3 w-3" />
            Add Option
          </Button>
        </div>

        {group.options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No options yet. Add options like Small, Large, Extra Cheese.
          </p>
        ) : (
          <div className="space-y-3">
            {group.options.map((option, optionIndex) => (
              <ModifierOptionRow
                key={option.id}
                option={option}
                basePrice={basePrice}
                recipeContext={recipeContext}
                recipeCost={optionRecipeCosts?.[option.id]}
                onRemove={() => onRemoveOption(optionIndex)}
                onUpdate={(field, value) => onUpdateOption(optionIndex, field, value)}
                onReplace={(next) => onReplaceOption(optionIndex, next)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ModifierOptionRowProps {
  option: ModifierOption
  basePrice: number
  recipeContext?: ModifierRecipeContext
  /** Recipe-derived cost for this option, when one has been costed. */
  recipeCost?: number
  onRemove: () => void
  onUpdate: <K extends keyof ModifierOption>(field: K, value: ModifierOption[K]) => void
  onReplace: (next: ModifierOption) => void
}

function ModifierOptionRow({ option, basePrice, recipeContext, recipeCost, onRemove, onUpdate, onReplace }: ModifierOptionRowProps) {
  const stockMode: ModifierStockMode = option.stock_mode ?? 'none'
  const isComposite = option.cost_mode === 'composite'
  // Live margin honoring the option's cost source. Options with no mode keep the
  // legacy rule (an attached recipe cost overrides the typed one).
  const margin = computeOptionMargin(basePrice, option, recipeCost)
  const marginTone =
    margin.marginPercent >= 60
      ? 'text-green-600'
      : margin.marginPercent >= 30
        ? 'text-amber-600'
        : 'text-red-600'

  return (
    <div className="border rounded-md p-3 space-y-3 bg-gray-50">
      <div className="flex gap-2">
        <Input
          placeholder="Option name (e.g., Small)"
          value={option.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          className="flex-1"
        />
        <Input
          type="number"
          step="0.01"
          placeholder="Price +/-"
          value={option.price_modifier}
          onChange={(e) => onUpdate('price_modifier', parseFloat(e.target.value) || 0)}
          className="w-28"
          title="Price modifier"
        />
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="text-red-500">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Cost source</Label>
          <CostSourceToggle
            mode={option.cost_mode}
            onSelect={(mode) => onReplace(setOptionCostMode(option, mode))}
          />
          {isComposite ? (
            <p className="text-[11px] text-muted-foreground">
              {recipeCost === undefined
                ? 'Attach a recipe below to cost this option from ingredients.'
                : `From recipe: ₱${recipeCost.toFixed(2)}`}
            </p>
          ) : (
            <>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                value={option.manual_cost ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  onUpdate('manual_cost', raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0))
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Manual cost (₱), used for margin.
                {option.cost_mode === undefined && ' An attached recipe overrides this.'}
              </p>
            </>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Stock tracking</Label>
          <Select
            value={stockMode}
            onValueChange={(value) => onUpdate('stock_mode', value as ModifierStockMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not tracked</SelectItem>
              <SelectItem value="simple">Simple count</SelectItem>
              <SelectItem value="recipe">Recipe-backed</SelectItem>
            </SelectContent>
          </Select>
          {stockMode === 'simple' && (
            <Input
              type="number"
              min={0}
              placeholder="Qty on hand"
              value={option.stock_qty ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim()
                onUpdate('stock_qty', raw === '' ? undefined : Math.max(0, parseInt(raw, 10) || 0))
              }}
              className="mt-1"
            />
          )}
          {stockMode === 'recipe' && !recipeContext?.inventoryEnabled && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Enable Inventory for this store to attach a recipe.
            </p>
          )}
          {stockMode === 'recipe' && recipeContext?.inventoryEnabled && !recipeContext.menuItemId && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Save the item first, then attach a recipe to deduct ingredients per sale.
            </p>
          )}
        </div>
      </div>

      {(stockMode === 'recipe' || isComposite) && recipeContext?.inventoryEnabled && recipeContext.menuItemId && (
        <ModifierOptionRecipeEditor
          tenantId={recipeContext.tenantId}
          tenantSlug={recipeContext.tenantSlug}
          menuItemId={recipeContext.menuItemId}
          modifierOptionId={option.id}
        />
      )}

      {margin.price > 0 && (
        <p className="text-xs text-muted-foreground">
          Sells at ₱{margin.price.toFixed(2)} · cost ₱{margin.cost.toFixed(2)} ·{' '}
          <span className={marginTone}>{margin.marginPercent.toFixed(0)}% margin</span>
        </p>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Option image (optional)</Label>
        <ImageUpload
          currentImageUrl={option.image_url || ''}
          onImageUploaded={(url) => onUpdate('image_url', url)}
          label=""
          description="Upload an image for this option"
          folder="modifier-options"
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={option.is_default || false}
          onChange={(e) => onUpdate('is_default', e.target.checked)}
          className="h-3 w-3"
        />
        <span className="text-xs">Default option</span>
      </label>
    </div>
  )
}

interface CostSourceToggleProps {
  mode: CostMode | undefined
  onSelect: (mode: CostMode) => void
}

/**
 * Two-way choice for where an option's cost comes from. A legacy option (no
 * mode) shows neither side pressed — the merchant has not chosen yet, and the
 * legacy precedence rule still applies until they do.
 */
function CostSourceToggle({ mode, onSelect }: CostSourceToggleProps) {
  const options: ReadonlyArray<{ mode: CostMode; label: string }> = [
    { mode: 'simple', label: 'Manual' },
    { mode: 'composite', label: 'Recipe' },
  ]

  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          aria-pressed={mode === o.mode}
          onClick={() => onSelect(o.mode)}
          className={
            mode === o.mode
              ? 'rounded px-3 py-1 text-xs font-medium bg-primary text-primary-foreground'
              : 'rounded px-3 py-1 text-xs text-muted-foreground hover:bg-muted'
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
