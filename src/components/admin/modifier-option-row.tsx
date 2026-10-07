'use client'

/**
 * One option inside a modifier group: name and extra charge on a single line,
 * everything else (default, photo, linked dish, cost, stock, recipe) behind a
 * settings toggle. What those hidden settings are currently doing is echoed
 * under the line, so a tracked stock count or a linked dish is never invisible.
 */

import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ImageUpload } from '@/components/shared/image-upload'
import { cn } from '@/lib/utils'
import type { CostMode, ModifierOption, ModifierStockMode } from '@/types/database'
import { setOptionCostMode } from '@/lib/modifier-groups-form'
import { computeOptionMargin } from '@/lib/modifier-margin'
import { ModifierOptionRecipeEditor } from '@/components/admin/modifier-option-recipe-editor'
import type { LinkableMenuItem, ModifierRecipeContext } from '@/components/admin/modifier-groups-editor'

interface ModifierOptionRowProps {
  option: ModifierOption
  basePrice: number
  recipeContext?: ModifierRecipeContext
  /** Recipe-derived cost for this option, when one has been costed. */
  recipeCost?: number
  linkableItems?: LinkableMenuItem[]
  onRemove: () => void
  onUpdate: <K extends keyof ModifierOption>(field: K, value: ModifierOption[K]) => void
  onReplace: (next: ModifierOption) => void
}

const MARGIN_GOOD_PERCENT = 60
const MARGIN_OK_PERCENT = 30

function marginTone(percent: number): string {
  if (percent >= MARGIN_GOOD_PERCENT) return 'text-emerald-700 dark:text-emerald-400'
  if (percent >= MARGIN_OK_PERCENT) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-600'
}

/** The hidden settings that are actually doing something, in words. */
function describeSettings(option: ModifierOption, linkedName: string | undefined): string[] {
  const notes: string[] = []
  if (option.is_default) notes.push('Selected by default')
  if (option.menu_item_id) notes.push(`Linked to ${linkedName ?? 'a dish'}`)
  if (option.stock_mode === 'simple') notes.push(`${option.stock_qty ?? 0} in stock`)
  if (option.stock_mode === 'recipe') notes.push('Stock from recipe')
  if (option.image_url) notes.push('Has photo')
  return notes
}

export function ModifierOptionRow({
  option,
  basePrice,
  recipeContext,
  recipeCost,
  linkableItems,
  onRemove,
  onUpdate,
  onReplace,
}: ModifierOptionRowProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [wasOpened, setWasOpened] = useState(false)

  const linkedItem = option.menu_item_id
    ? linkableItems?.find((i) => i.id === option.menu_item_id)
    : undefined
  const isLinked = Boolean(option.menu_item_id)
  const displayName = isLinked ? (linkedItem?.name ?? option.name) : option.name
  const label = displayName || 'this option'
  const notes = describeSettings(option, linkedItem?.name)

  const toggle = () => {
    setWasOpened(true)
    setIsOpen((open) => !open)
  }

  return (
    <div>
      {/* On a phone the name gets its own line; squeezed beside the price it
          showed three or four letters. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 p-2 max-sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input
          aria-label="Option name"
          placeholder="Option, e.g. Large"
          value={displayName}
          onChange={(e) => onUpdate('name', e.target.value)}
          disabled={isLinked}
          className="h-10 min-w-0 max-sm:col-span-3"
        />
        <SurchargeInput
          label={label}
          value={isLinked ? (linkedItem?.price ?? option.price_modifier) : option.price_modifier}
          isLinked={isLinked}
          onChange={(value) => onUpdate('price_modifier', value)}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label={`More settings for ${label}`}
          className={cn('relative h-10 shrink-0 gap-1.5 px-2.5 text-muted-foreground sm:px-3', isOpen && 'bg-muted text-foreground')}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="max-sm:sr-only" aria-hidden>Details</span>
          {notes.length > 0 && !isOpen && (
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!isOpen && notes.length > 0 && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">{notes.join(' · ')}</p>
      )}

      {wasOpened && (
        <div hidden={!isOpen} className="space-y-4 border-t bg-muted/40 p-3 sm:p-4">
          <OptionSettings
            option={option}
            basePrice={basePrice}
            recipeContext={recipeContext}
            recipeCost={recipeCost}
            linkableItems={linkableItems}
            isLinked={isLinked}
            onUpdate={onUpdate}
            onReplace={onReplace}
          />
        </div>
      )}
    </div>
  )
}

interface OptionSettingsProps {
  option: ModifierOption
  basePrice: number
  recipeContext?: ModifierRecipeContext
  recipeCost?: number
  linkableItems?: LinkableMenuItem[]
  isLinked: boolean
  onUpdate: ModifierOptionRowProps['onUpdate']
  onReplace: ModifierOptionRowProps['onReplace']
}

function OptionSettings({ option, basePrice, recipeContext, recipeCost, linkableItems, isLinked, onUpdate, onReplace }: OptionSettingsProps) {
  const stockMode: ModifierStockMode = option.stock_mode ?? 'none'
  const isComposite = option.cost_mode === 'composite'
  // Live margin honoring the option's cost source. Options with no mode keep the
  // legacy rule (an attached recipe cost overrides the typed one).
  const margin = computeOptionMargin(basePrice, option, recipeCost)
  const canAttachRecipe = Boolean(recipeContext?.inventoryEnabled && recipeContext.menuItemId)

  return (
    <>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Selected by default</span>
        <Switch checked={option.is_default || false} onCheckedChange={(checked) => onUpdate('is_default', checked)} />
      </label>

      {linkableItems && linkableItems.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm">Use another dish as this option</Label>
          <Select
            value={option.menu_item_id ?? 'none'}
            onValueChange={(value) => onReplace({ ...option, menu_item_id: value === 'none' ? null : value })}
          >
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue placeholder="No, type a name and price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No, type a name and price</SelectItem>
              {linkableItems.map((menuItem) => (
                <SelectItem key={menuItem.id} value={menuItem.id}>{menuItem.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLinked && (
            <p className="text-xs text-muted-foreground">
              Name, price and photo follow that dish, and this shows as sold out when it is.
            </p>
          )}
        </div>
      )}

      <ImageUpload
        currentImageUrl={option.image_url || ''}
        onImageUploaded={(url) => onUpdate('image_url', url)}
        label="Photo (optional)"
        folder="modifier-options"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm">Cost source</Label>
          <CostSourceToggle mode={option.cost_mode} onSelect={(mode) => onReplace(setOptionCostMode(option, mode))} />
          {isComposite ? (
            <p className="text-xs text-muted-foreground">
              {recipeCost === undefined
                ? 'Add a recipe below to cost this option from ingredients.'
                : `From recipe: ₱${recipeCost.toFixed(2)}`}
            </p>
          ) : (
            <>
              <Input
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Manual cost"
                value={option.manual_cost ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  onUpdate('manual_cost', raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0))
                }}
                className="h-10 bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Manual cost (₱), used for margin.
                {option.cost_mode === undefined && ' An attached recipe overrides this.'}
              </p>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Stock tracking</Label>
          <Select value={stockMode} onValueChange={(value) => onUpdate('stock_mode', value as ModifierStockMode)}>
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Don&apos;t track</SelectItem>
              <SelectItem value="simple">Count how many are left</SelectItem>
              <SelectItem value="recipe">From recipe ingredients</SelectItem>
            </SelectContent>
          </Select>
          {stockMode === 'simple' && (
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="How many left"
              aria-label="How many left"
              value={option.stock_qty ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim()
                onUpdate('stock_qty', raw === '' ? undefined : Math.max(0, parseInt(raw, 10) || 0))
              }}
              className="h-10 bg-background"
            />
          )}
          {stockMode === 'recipe' && !recipeContext?.inventoryEnabled && (
            <p className="text-xs text-muted-foreground">Turn on Inventory for this store to use recipes.</p>
          )}
          {stockMode === 'recipe' && recipeContext?.inventoryEnabled && !recipeContext.menuItemId && (
            <p className="text-xs text-muted-foreground">Save the dish first, then add a recipe here.</p>
          )}
        </div>
      </div>

      {(stockMode === 'recipe' || isComposite) && canAttachRecipe && recipeContext?.menuItemId && (
        <ModifierOptionRecipeEditor
          tenantId={recipeContext.tenantId}
          tenantSlug={recipeContext.tenantSlug}
          menuItemId={recipeContext.menuItemId}
          modifierOptionId={option.id}
          onSaved={recipeContext.onRecipeSaved}
        />
      )}

      {margin.price > 0 && margin.cost > 0 && (
        <p className="text-xs text-muted-foreground">
          Sells at ₱{margin.price.toFixed(2)} · cost ₱{margin.cost.toFixed(2)} ·{' '}
          <span className={marginTone(margin.marginPercent)}>{margin.marginPercent.toFixed(0)}% margin</span>
        </p>
      )}
    </>
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
    <div className="flex rounded-lg border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          aria-pressed={mode === o.mode}
          onClick={() => onSelect(o.mode)}
          className={cn(
            'h-8 flex-1 rounded-md px-3 text-sm font-medium transition-colors',
            mode === o.mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SurchargeInputProps {
  label: string
  value: number
  isLinked: boolean
  onChange: (value: number) => void
}

/**
 * The option's extra charge, backed by the text the owner typed. A number-only
 * input snapped an emptied field straight back to "0" mid-edit, so retyping
 * "15" over "10" meant fighting the field.
 */
function SurchargeInput({ label, value, isLinked, onChange }: SurchargeInputProps) {
  const [draft, setDraft] = useState(String(value))
  const [seenValue, setSeenValue] = useState(value)
  if (seenValue !== value) {
    setSeenValue(value)
    const draftValue = draft.trim() === '' ? 0 : parseFloat(draft)
    if (draftValue !== value) setDraft(String(value))
  }

  return (
    <div className="relative w-24 shrink-0 max-sm:w-full">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+₱</span>
      <Input
        type="number"
        step="0.01"
        min={0}
        inputMode="decimal"
        aria-label={`Extra charge for ${label}`}
        placeholder="0"
        value={draft === '0' ? '' : draft}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          const parsed = parseFloat(raw)
          onChange(Number.isFinite(parsed) ? parsed : 0)
        }}
        disabled={isLinked}
        className="h-10 pl-8 tabular-nums"
        title={isLinked ? 'Taken from the linked dish' : undefined}
      />
    </div>
  )
}
