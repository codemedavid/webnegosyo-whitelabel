'use client'

/**
 * Sizes and add-ons for stores still on the original option editors. The old
 * "Variation System: Simple (Legacy) / Grouped (New)" card is now a two-way
 * switch inside the sizes section, worded for what the owner is making.
 */

import type { ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import { VariationGroupsEditor } from '@/components/admin/variation-groups-editor'
import { AddonEditor, type AddonRecipeContext } from '@/components/admin/addon-editor'
import type { LegacyOptions } from '@/components/admin/menu-editor/use-legacy-options'

interface LegacyOptionsSectionsProps {
  options: LegacyOptions
  addonLibraryPicker: ReactNode
  recipeContext: AddonRecipeContext
}

const STYLE_CHOICES = [
  { isGrouped: false, label: 'One list of sizes' },
  { isGrouped: true, label: 'Several groups' },
] as const

export function LegacyOptionsSections({ options, addonLibraryPicker, recipeContext }: LegacyOptionsSectionsProps) {
  const { useGroupedVariations, setUseGroupedVariations, typeHandlers } = options

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">How are this dish&apos;s sizes set up?</p>
        <div role="group" aria-label="How sizes are set up" className="flex rounded-lg border bg-card p-0.5">
          {STYLE_CHOICES.map((choice) => {
            const isActive = useGroupedVariations === choice.isGrouped
            return (
              <button
                key={choice.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => setUseGroupedVariations(choice.isGrouped)}
                className={cn(
                  'h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {choice.label}
              </button>
            )
          })}
        </div>
      </div>

      {useGroupedVariations ? (
        <VariationGroupsEditor
          variationTypes={options.variationTypes}
          onAddVariationType={typeHandlers.add}
          onRemoveVariationType={typeHandlers.remove}
          onUpdateVariationType={typeHandlers.update}
          onAddVariationOption={typeHandlers.addOption}
          onRemoveVariationOption={typeHandlers.removeOption}
          onUpdateVariationOption={typeHandlers.updateOption}
        />
      ) : (
        <SimpleSizesSection options={options} />
      )}

      <AddonEditor
        addons={options.addons}
        onAddAddon={options.addonHandlers.add}
        onRemoveAddon={options.addonHandlers.remove}
        onUpdateAddon={options.addonHandlers.update}
        headerAction={addonLibraryPicker}
        recipeContext={recipeContext}
      />
    </>
  )
}

function SimpleSizesSection({ options }: { options: LegacyOptions }) {
  const { variations, variationHandlers } = options
  return (
    <EditorSection
      title="Sizes"
      description="Like Small, Medium, Large. The extra charge is added to the price."
      action={
        <Button type="button" variant="outline" size="sm" onClick={variationHandlers.add}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add size
        </Button>
      }
    >
      {variations.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          No sizes. Skip this if the dish comes in one size.
        </p>
      ) : (
        <div className="space-y-2">
          {variations.map((variation, index) => (
            <div key={variation.id} className="flex items-center gap-2">
              <Input
                aria-label="Size name"
                placeholder="Size, e.g. Small"
                value={variation.name}
                onChange={(e) => variationHandlers.update(index, 'name', e.target.value)}
                className="h-10"
              />
              <div className="relative w-28 shrink-0">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+₱</span>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  aria-label={`Extra charge for ${variation.name || 'this size'}`}
                  placeholder="0"
                  value={variation.price_modifier}
                  onChange={(e) => variationHandlers.update(index, 'price_modifier', parseFloat(e.target.value) || 0)}
                  className="h-10 pl-8 tabular-nums"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${variation.name || 'size'}`}
                onClick={() => variationHandlers.remove(index)}
                className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </EditorSection>
  )
}
