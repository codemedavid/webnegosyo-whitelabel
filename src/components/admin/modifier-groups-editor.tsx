'use client'

import type { ReactNode } from 'react'
import { Layers, ListChecks, PlusCircle } from 'lucide-react'
import type { ModifierGroup, ModifierOption } from '@/types/database'
import {
  createModifierGroup,
  createModifierOption,
  setGroupMaxSelect,
  setGroupMinSelect,
} from '@/lib/modifier-groups-form'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import { ModifierGroupCard } from '@/components/admin/modifier-group-card'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'

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
  /** Fired after an option's recipe is saved, so recipe costs can be re-read. */
  onRecipeSaved?: () => void
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
  /** Optional slot rendered beside the section title (e.g. the library picker). */
  headerAction?: ReactNode
  /** When provided, each group gets a "Save to library" control. */
  onSaveGroupToLibrary?: (group: ModifierGroup) => void
  /**
   * Menu items an option may link to. Linking makes the option a live reference:
   * its name, price and image come from that item at render time.
   */
  linkableItems?: LinkableMenuItem[]
}

/** A menu item that can be offered as an add-on option. */
export interface LinkableMenuItem {
  id: string
  name: string
  price: number
}

/**
 * Editor for a dish's choices (Size, Flavor) and extras (Extra rice ×2). State
 * is owned by the parent form; this component is presentational and updates
 * immutably through `onChange`.
 */
export function ModifierGroupsEditor({ groups, onChange, basePrice, recipeContext, optionRecipeCosts, headerAction, onSaveGroupToLibrary, linkableItems }: ModifierGroupsEditorProps) {
  const addGroup = (mode: 'choice' | 'quantity') => {
    onChange([...groups, createModifierGroup(`grp-${Date.now()}`, groups.length, mode)])
  }

  const replaceGroup = (groupIndex: number, next: ModifierGroup) => {
    onChange(groups.map((g, i) => (i === groupIndex ? next : g)))
  }

  const withOptions = (groupIndex: number, map: (options: ModifierOption[]) => ModifierOption[]) => {
    const group = groups[groupIndex]
    replaceGroup(groupIndex, { ...group, options: map(group.options) })
  }

  return (
    <EditorSection
      id={DISH_SECTION_IDS.choices}
      icon={Layers}
      title="Sizes & add-ons"
      description="Let customers pick a size or flavor, or add extras. Skip this if the dish has none."
      action={headerAction}
    >
      <div className="space-y-4">
        {groups.map((group, groupIndex) => (
          <ModifierGroupCard
            key={group.id}
            group={group}
            basePrice={basePrice}
            recipeContext={recipeContext}
            optionRecipeCosts={optionRecipeCosts}
            linkableItems={linkableItems}
            // The promise is deliberately dropped — the handler owns its own
            // failure reporting and is contracted never to reject.
            onSaveToLibrary={onSaveGroupToLibrary ? () => { void onSaveGroupToLibrary(group) } : undefined}
            onRemoveGroup={() => onChange(groups.filter((_, i) => i !== groupIndex))}
            onReplaceGroup={(next) => replaceGroup(groupIndex, next)}
            onUpdateName={(name) => replaceGroup(groupIndex, { ...group, name })}
            onUpdateMinSelect={(min) => replaceGroup(groupIndex, setGroupMinSelect(group, min))}
            onUpdateMaxSelect={(max) => replaceGroup(groupIndex, setGroupMaxSelect(group, max))}
            onAddOption={() =>
              withOptions(groupIndex, (options) => [...options, createModifierOption(`opt-${Date.now()}`, options.length)])
            }
            onRemoveOption={(optionIndex) =>
              withOptions(groupIndex, (options) => options.filter((_, i) => i !== optionIndex))
            }
            onUpdateOption={(optionIndex, field, value) =>
              withOptions(groupIndex, (options) => options.map((o, i) => (i === optionIndex ? { ...o, [field]: value } : o)))
            }
            onReplaceOption={(optionIndex, next) =>
              withOptions(groupIndex, (options) => options.map((o, i) => (i === optionIndex ? next : o)))
            }
          />
        ))}

        <div className="grid gap-2 sm:grid-cols-2">
          <AddGroupButton
            icon={ListChecks}
            title="Add a choice"
            example="Size, flavor, spice level"
            onClick={() => addGroup('choice')}
          />
          <AddGroupButton
            icon={PlusCircle}
            title="Add extras"
            example="Extra rice, egg, sauces"
            onClick={() => addGroup('quantity')}
          />
        </div>
      </div>
    </EditorSection>
  )
}

interface AddGroupButtonProps {
  icon: typeof ListChecks
  title: string
  example: string
  onClick: () => void
}

function AddGroupButton({ icon: Icon, title, example, onClick }: AddGroupButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors hover:border-foreground/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{example}</span>
      </span>
    </button>
  )
}
