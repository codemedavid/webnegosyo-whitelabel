'use client'

/**
 * "Sizes & choices" and "Add-ons" for stores still on the original option
 * editors.
 *
 * There is no longer a "One list of sizes / Several groups" switch — that was
 * the storage format talking. A dish starts with sizes or a choice; a size
 * list turns into choice lists the moment the owner adds a second choice.
 */

import type { ReactNode } from 'react'
import { ListChecks, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import { AddRowButton, OptionList, OptionRow, StarterTile } from '@/components/admin/menu-editor/option-rows'
import { VariationGroupsEditor } from '@/components/admin/variation-groups-editor'
import { AddonEditor, type AddonRecipeContext } from '@/components/admin/addon-editor'
import type { LegacyOptions } from '@/components/admin/menu-editor/use-legacy-options'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'
import { describeChoiceCount } from '@/lib/menu-editor/option-summary'

interface LegacyOptionsSectionsProps {
  options: LegacyOptions
  addonLibraryPicker: ReactNode
  recipeContext: AddonRecipeContext
}

export function LegacyOptionsSections({ options, addonLibraryPicker, recipeContext }: LegacyOptionsSectionsProps) {
  const { useGroupedVariations: isGrouped, variations, variationTypes } = options
  const count = isGrouped ? variationTypes.length : variations.length

  return (
    <>
      <EditorSection
        id={DISH_SECTION_IDS.choices}
        title="Sizes & choices"
        meta={describeChoiceCount(isGrouped, count)}
        description="Customers pick one option from each list. Skip this if the dish comes one way."
      >
        {count === 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <StarterTile icon={Ruler} title="Add sizes" example="Small · Medium · Large" onClick={options.startSizes} />
            <StarterTile
              icon={ListChecks}
              title="Add a choice"
              example="Spice level, flavor, sugar level"
              onClick={options.startChoices}
            />
          </div>
        ) : isGrouped ? (
          <VariationGroupsEditor variationTypes={variationTypes} handlers={options.typeHandlers} />
        ) : (
          <SizeList options={options} />
        )}
      </EditorSection>

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

function SizeList({ options }: { options: LegacyOptions }) {
  const { variations, variationHandlers } = options
  return (
    <div className="space-y-3">
      <OptionList>
        {variations.map((size, index) => (
          <OptionRow
            key={size.id}
            name={size.name}
            onNameChange={(name) => variationHandlers.update(index, 'name', name)}
            nameLabel="Size name"
            namePlaceholder="e.g. Small, Regular, 16 oz"
            price={size.price_modifier}
            onPriceChange={(price) => variationHandlers.update(index, 'price_modifier', price)}
            priceLabel="Extra charge"
            pricePrefix="+₱"
            isDefault={size.is_default}
            onToggleDefault={() => variationHandlers.setDefault(index)}
            onRemove={() => variationHandlers.remove(index)}
          />
        ))}
      </OptionList>
      <AddRowButton label="Add size" onClick={variationHandlers.add} />

      <div className="flex flex-col gap-3 rounded-xl bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Need another pick, like <span className="font-medium text-foreground">Spice level</span>? Your sizes
          stay as the first choice.
        </p>
        <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={options.addChoiceAfterSizes}>
          Add a choice
        </Button>
      </div>
    </div>
  )
}
