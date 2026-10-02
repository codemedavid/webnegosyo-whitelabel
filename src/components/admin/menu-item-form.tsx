'use client'

/**
 * The add / edit dish screen.
 *
 * Laid out the way an owner thinks about a dish: what it is (photo, name,
 * price, category), whether people can order it, and what they can choose.
 * Everything else — cost, recipe, pre-orders, selling tools, branches — sits
 * in a "More options" list of closed rows that each state what they are doing.
 * One Save button, pinned to the bottom of the screen.
 */

import { useState, type ReactNode } from 'react'
import { ToggleRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MenuItem, Category, BcgClassification, ModifierGroup, PresellStock } from '@/types/database'
import { AddonLibraryPicker } from '@/components/admin/addon-library-picker'
import { ModifierGroupsEditor, type LinkableMenuItem } from '@/components/admin/modifier-groups-editor'
import { ModifierLibraryPicker } from '@/components/admin/modifier-library-picker'
import { SettingSwitch } from '@/components/admin/menu-item-presell-section'
import { syncPresellAllocationsAction } from '@/app/actions/presell'
import { draftFromRows, diffDraft, type DraftAllocation } from '@/lib/presell/allocation-draft'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { serializeGroups, splitGroupsToLegacyColumns, omitUnchangedOptionStock } from '@/lib/modifier-groups-form'
import { attachEntriesToAddons } from '@/lib/addon-library-utils'
import { attachEntriesToGroups, buildLibraryDraftFromGroup } from '@/lib/modifier-library-utils'
import { createModifierGroupLibraryEntryAction } from '@/app/actions/modifier-library'
import { describeActionError, runServerAction } from '@/components/admin/server-action-safety'
import { useMenuItemCosts } from '@/hooks/use-menu-item-costs'
import { RecipeEditor } from '@/components/admin/recipe-editor'
import { resolvePostSaveStep } from '@/lib/menu-item-save-flow'
import { EditorSection } from '@/components/admin/menu-editor/editor-section'
import {
  DishBasicsSection,
  MIN_DESCRIPTION_LENGTH,
  type DishBasics,
  type DishBasicsErrors,
} from '@/components/admin/menu-editor/dish-basics-section'
import { DishMoreOptions, type DishBoosts } from '@/components/admin/menu-editor/dish-more-options'
import { LegacyOptionsSections } from '@/components/admin/menu-editor/legacy-options-sections'
import { useLegacyOptions } from '@/components/admin/menu-editor/use-legacy-options'
import { SaveBar } from '@/components/admin/menu-editor/save-bar'
import { DishPreviewCard, SectionNavChips, SectionNavList } from '@/components/admin/menu-editor/dish-editor-rail'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'
import { describeChoiceCount, summarizeLegacyOptions, summarizeModifierGroups } from '@/lib/menu-editor/option-summary'
import { buildSectionNav } from '@/lib/menu-editor/section-nav'
import { DeleteDishSection } from '@/components/admin/menu-editor/delete-dish-section'

interface MenuItemFormProps {
  item?: MenuItem
  categories: Category[]
  tenantId: string
  tenantSlug: string
  menuEngineeringEnabled?: boolean
  modifierGroupsEnabled?: boolean
  /** Menu items an add-on option may link to (live reference). */
  linkableItems?: LinkableMenuItem[]
  inventoryEnabled?: boolean
  /** Whether this dish has a recipe; undefined when unknown or not read. */
  hasRecipe?: boolean
  /** Tenant flag: per-date presell allocations (migration 20260830120000). */
  presellEnabled?: boolean
  /** Allocations fetched by the page so the presell panel opens populated. */
  presellAllocations?: PresellStock[]
  /** Set when the page could not read them; the panel is withheld rather than shown empty. */
  presellLoadError?: string
  convexUrl?: string
  /** The per-branch panel, which saves on its own and so lives outside the form. */
  branchesPanel?: ReactNode
}

const FORM_ID = 'menu-item-form'

// Client-side validation (the server applies the same rules).
const menuItemFormSchema = z.object({
  name: z.string().trim().min(2, 'Give the dish a name (at least 2 letters).'),
  description: z.string().min(MIN_DESCRIPTION_LENGTH, `Add a short description (at least ${MIN_DESCRIPTION_LENGTH} characters).`),
  price: z.string().refine((val) => {
    const num = parseFloat(val)
    return Number.isFinite(num) && num >= 0
  }, 'Enter a price. Use 0 for a free item.'),
  discounted_price: z.string().optional().refine((val) => {
    if (!val) return true
    const num = parseFloat(val)
    return !isNaN(num) && num >= 0
  }, 'Sale price must be 0 or more, or left empty.'),
  // Image is optional — accept a valid URL or an empty string (no image).
  image_url: z.string().url('That photo link is not valid. Upload it again.').or(z.literal('')),
  category_id: z.string().uuid('Choose a category.'),
})

/** Which element to focus for each field, so the owner lands on the problem. */
const FIELD_ELEMENT_ID: Partial<Record<keyof DishBasics, string>> = {
  name: 'name',
  description: 'description',
  price: 'price',
  discounted_price: 'discounted_price',
  category_id: 'category',
  image_url: 'image_url',
}

function focusField(field: keyof DishBasics | undefined) {
  if (!field) return
  const elementId = FIELD_ELEMENT_ID[field]
  if (elementId) document.getElementById(elementId)?.focus()
}

/** How many of the required fields are still unfilled or invalid. */
function countMissingDetails(basics: DishBasics): number {
  const parsed = menuItemFormSchema.safeParse(basics)
  return parsed.success ? 0 : new Set(parsed.error.issues.map((issue) => issue.path[0])).size
}

function errorsFromIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): DishBasicsErrors {
  const next: DishBasicsErrors = {}
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && !(field in next)) next[field as keyof DishBasics] = issue.message
  }
  return next
}

export function MenuItemForm({
  item,
  categories,
  tenantId,
  tenantSlug,
  menuEngineeringEnabled = false,
  modifierGroupsEnabled,
  linkableItems,
  inventoryEnabled = false,
  hasRecipe,
  presellEnabled,
  presellAllocations,
  presellLoadError,
  convexUrl,
  branchesPanel,
}: MenuItemFormProps) {
  const router = useRouter()
  const [persistedItemId, setPersistedItemId] = useState(item?.id)
  const [stockBaseline, setStockBaseline] = useState<ModifierGroup[]>(item?.modifier_groups ?? [])
  // Recipe-derived costs for the per-option margin display. No-ops when the
  // tenant has no inventory or the item has not been saved yet.
  const { optionRecipeCosts, refresh: refreshCosts } = useMenuItemCosts(tenantId, item?.id, inventoryEnabled)

  const [basics, setBasics] = useState<DishBasics>({
    name: item?.name || '',
    description: item?.description || '',
    price: item?.price.toString() || '',
    discounted_price: item?.discounted_price?.toString() || '',
    image_url: item?.image_url || '',
    category_id: item?.category_id || categories[0]?.id || '',
  })
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true)
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false)
  const [isPresellOn, setIsPresellOn] = useState(item?.presell_enabled ?? false)
  const [boosts, setBoosts] = useState<DishBoosts>({
    show_in_checkout_upsell: item?.show_in_checkout_upsell ?? false,
    bcg_classification: (item?.bcg_classification || 'unclassified') as BcgClassification,
    badge_text: item?.badge_text || '',
  })

  const legacy = useLegacyOptions(item)
  // Unified editor state. Seeded from the item's existing modifiers (explicit
  // modifier_groups OR derived from legacy variation_types/variations/addons) so
  // enabling the flag on a legacy item shows its current options.
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(() =>
    modifierGroupsEnabled ? normalizeModifierGroups(item ?? {}) : []
  )
  const [errors, setErrors] = useState<DishBasicsErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  /**
   * The freshly created item whose recipe step is open. Creating used to end by
   * silently closing to the menu list — on an inventory tenant that was the
   * moment the recipe was lost, and a dish with no recipe deducts nothing when
   * it sells. See `resolvePostSaveStep`.
   */
  const [recipeStepItemId, setRecipeStepItemId] = useState<string | null>(null)
  const [isRecipeSaving, setIsRecipeSaving] = useState(false)
  /**
   * Pre-order dates, staged like every other field.
   *
   * `savedAllocations` is the baseline the save diffs against; `presellDraft`
   * is what the merchant has now. Both are seeded once — an initializer does
   * not re-run — so a server re-render mid-edit cannot discard typing.
   */
  const [savedAllocations, setSavedAllocations] = useState<DraftAllocation[]>(() =>
    draftFromRows(presellAllocations ?? []),
  )
  const [presellDraft, setPresellDraft] = useState<DraftAllocation[]>(savedAllocations)

  const updateBasics = <K extends keyof DishBasics>(field: K, value: DishBasics[K]) => {
    setBasics((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validateForm = (): boolean => {
    const parsed = menuItemFormSchema.safeParse(basics)
    if (parsed.success) {
      setErrors({})
      return true
    }
    const nextErrors = errorsFromIssues(parsed.error.issues)
    setErrors(nextErrors)
    const firstField = parsed.error.issues[0]?.path[0] as keyof DishBasics | undefined
    toast.error(parsed.error.issues[0]?.message ?? 'Please check the highlighted fields.')
    focusField(firstField)
    return false
  }

  /**
   * Persist the pre-order dates the merchant staged. Returns a message when
   * the write was refused — a date that already has orders cannot be dropped
   * — and undefined when there was nothing to do or it all landed.
   */
  const savePresellDraft = async (menuItemId: string): Promise<string | undefined> => {
    const { upserts, deletes } = diffDraft(savedAllocations, presellDraft)
    if (upserts.length === 0 && deletes.length === 0) return undefined

    const result = await syncPresellAllocationsAction(tenantId, tenantSlug, {
      menuItemId,
      upserts,
      deletes,
    })
    if (!result.success) return result.error || 'Failed to save the pre-order dates'

    // The draft is the baseline now, so the "unsaved dates" warning clears
    // and a second save does not re-send what already landed. This matters
    // when the save keeps the merchant here — the recipe step does.
    setSavedAllocations(presellDraft)
    return undefined
  }

  const buildInput = () => {
    // With the unified editor on, `modifier_groups` is canonical and the
    // legacy columns are derived from it so surfaces that don't yet read the
    // new model (storefront, POS, mobile) keep rendering.
    const cleanGroups = modifierGroupsEnabled ? serializeGroups(modifierGroups) : []
    const legacyColumns = modifierGroupsEnabled ? splitGroupsToLegacyColumns(cleanGroups) : null
    const input = {
      name: basics.name,
      description: basics.description,
      price: parseFloat(basics.price),
      discounted_price: basics.discounted_price ? parseFloat(basics.discounted_price) : null,
      image_url: basics.image_url,
      category_id: basics.category_id,
      modifier_groups: persistedItemId ? omitUnchangedOptionStock(cleanGroups, stockBaseline) : cleanGroups,
      // Include legacy formats for backward compatibility
      variation_types: legacyColumns
        ? legacyColumns.variation_types
        : legacy.useGroupedVariations ? legacy.variationTypes : [],
      variations: legacyColumns ? legacyColumns.variations : legacy.useGroupedVariations ? [] : legacy.variations,
      addons: legacyColumns ? legacyColumns.addons : legacy.addons,
      is_available: isAvailable,
      is_featured: isFeatured,
      show_in_checkout_upsell: boosts.show_in_checkout_upsell,
      order: item?.order || 0,
      ...(menuEngineeringEnabled ? {
        bcg_classification: boosts.bcg_classification,
        badge_text: boosts.badge_text || null,
      } : {}),
      ...(presellEnabled ? { presell_enabled: isPresellOn } : {}),
    }
    return { input, cleanGroups }
  }

  const reportServerError = (error: string | undefined) => {
    if (!error) {
      toast.error('Could not save the dish. Please try again.')
      return
    }
    try {
      const errorData = JSON.parse(error)
      if (Array.isArray(errorData)) {
        // Zod validation errors from the server
        setErrors(errorsFromIssues(errorData))
        toast.error('Please fix the highlighted fields.')
        return
      }
      toast.error(error)
    } catch {
      toast.error(error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const { createMenuItemAction, updateMenuItemAction } = await import('@/app/actions/menu-items')
      const { input, cleanGroups } = buildInput()

      const result = persistedItemId
        ? await updateMenuItemAction(persistedItemId, tenantId, tenantSlug, input)
        : await createMenuItemAction(tenantId, tenantSlug, input)

      if (!result.success) {
        reportServerError(result.error)
        return
      }

      const savedItemId = (result.data as { id?: string } | undefined)?.id ?? persistedItemId
      setPersistedItemId(savedItemId)
      setStockBaseline(cleanGroups)
      /*
       * The dates land here, with the dish, rather than one server action
       * per click while the merchant is still editing. If they do not land
       * the merchant is told and kept on the page — navigating away would
       * discard a draft that only exists in this component's state.
       */
      if (presellEnabled && savedItemId && !presellLoadError) {
        const allocationError = await savePresellDraft(savedItemId)
        if (allocationError) {
          toast.error(allocationError)
          return
        }
      }

      toast.success(item ? 'Changes saved' : `${basics.name} added to your menu`)
      const step = resolvePostSaveStep({ isNewItem: !item, inventoryEnabled, savedItemId })
      if (step.kind === 'link-ingredients') {
        // Hold the merchant here for the recipe instead of closing: until a
        // dish has one, selling it deducts no stock.
        setRecipeStepItemId(step.itemId)
      } else {
        router.push(`/${tenantSlug}/admin/menu`)
        router.refresh()
      }
    } catch (error) {
      // Includes Next's own "unexpected response" rejection, which says nothing
      // a merchant can act on. `describeActionError` turns it into the real
      // instruction — reload and sign in again — without hiding other errors.
      toast.error(describeActionError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Leaving the recipe step always lands on the menu list, recipe or not. */
  const finishRecipeStep = () => {
    if (isRecipeSaving) return
    router.push(`/${tenantSlug}/admin/menu`)
    router.refresh()
  }

  const attachAddonsFromLibrary = (entries: Parameters<typeof attachEntriesToAddons>[1]) => {
    legacy.setAddons((prev) => {
      const merged = attachEntriesToAddons(prev, entries)
      if (merged.length === prev.length) toast.info('Those add-ons are already on this item')
      return merged
    })
  }

  const attachGroupsFromLibrary = (entries: Parameters<typeof attachEntriesToGroups>[1]) => {
    setModifierGroups((prev) => {
      const merged = attachEntriesToGroups(prev, entries)
      if (merged.length === prev.length) {
        toast.info('Those groups are already on this item')
      } else {
        toast.success('Added from library')
      }
      return merged
    })
  }

  const saveGroupToLibrary = async (group: ModifierGroup) => {
    const draft = buildLibraryDraftFromGroup(group)
    if (!draft.name.trim()) {
      toast.error('Give the group a name before saving it to the library')
      return
    }
    if (draft.options.length === 0) {
      toast.error('Add at least one option before saving to the library')
      return
    }
    // The editor calls this from an onClick and drops the promise, so a
    // rejected Server Action here would reach the window's unhandled-rejection
    // handler instead of the merchant. It must not be able to reject.
    const outcome = await runServerAction(() =>
      createModifierGroupLibraryEntryAction(tenantId, tenantSlug, draft)
    )
    if (!outcome.ok) {
      toast.error(outcome.message)
      return
    }
    if (!outcome.value.success) {
      toast.error(outcome.value.error ?? 'Failed to save group to library')
      return
    }
    toast.success(`"${draft.name}" saved to your modifier library`)
  }

  const recipeContext = {
    tenantId,
    tenantSlug,
    menuItemId: item?.id,
    inventoryEnabled,
    onRecipeSaved: refreshCosts,
  }
  const price = parseFloat(basics.price) || 0
  const choiceCount = legacy.useGroupedVariations ? legacy.variationTypes.length : legacy.variations.length
  const optionLines = modifierGroupsEnabled
    ? summarizeModifierGroups(modifierGroups)
    : summarizeLegacyOptions({
        isGrouped: legacy.useGroupedVariations,
        variations: legacy.variations,
        variationTypes: legacy.variationTypes,
        addons: legacy.addons,
      })
  const navEntries = buildSectionNav({
    missingDetailCount: countMissingDetails(basics),
    isAvailable,
    hasUnifiedOptions: Boolean(modifierGroupsEnabled),
    choiceStatus: describeChoiceCount(legacy.useGroupedVariations, choiceCount),
    addonCount: legacy.addons.length,
    optionGroupCount: modifierGroups.length,
  })
  const categoryName = categories.find((category) => category.id === basics.category_id)?.name

  return (
    <div className="mx-auto max-w-6xl">
      <SectionNavChips entries={navEntries} />

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-5">
          <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
            <DishBasicsSection values={basics} errors={errors} categories={categories} onChange={updateBasics} />

            <EditorSection id={DISH_SECTION_IDS.availability} icon={ToggleRight} title="Availability">
              <div className="divide-y rounded-xl border">
                <SettingSwitch
                  id="is_available"
                  label="Available to order"
                  description="Turn off when you run out. It stays on your menu, marked out of stock."
                  checked={isAvailable}
                  onCheckedChange={setIsAvailable}
                />
                <SettingSwitch
                  id="is_featured"
                  label="Featured"
                  description="Highlight this dish on your menu."
                  checked={isFeatured}
                  onCheckedChange={setIsFeatured}
                />
              </div>
            </EditorSection>

            {modifierGroupsEnabled ? (
              <ModifierGroupsEditor
                groups={modifierGroups}
                onChange={setModifierGroups}
                basePrice={price}
                recipeContext={recipeContext}
                optionRecipeCosts={optionRecipeCosts}
                headerAction={<ModifierLibraryPicker tenantId={tenantId} onAttach={attachGroupsFromLibrary} />}
                onSaveGroupToLibrary={saveGroupToLibrary}
                linkableItems={linkableItems?.filter((candidate) => candidate.id !== item?.id)}
              />
            ) : (
              <LegacyOptionsSections
                options={legacy}
                addonLibraryPicker={<AddonLibraryPicker tenantId={tenantId} onAttach={attachAddonsFromLibrary} />}
                recipeContext={recipeContext}
              />
            )}
          </form>

          <DishMoreOptions
            itemId={item?.id}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            convexUrl={convexUrl}
            price={price}
            discountedPrice={parseFloat(basics.discounted_price) || undefined}
            inventoryEnabled={inventoryEnabled}
            hasRecipe={hasRecipe}
            onRecipeSaved={refreshCosts}
            presell={presellEnabled ? {
              isEnabled: isPresellOn,
              onToggle: setIsPresellOn,
              savedAllocations,
              draft: presellDraft,
              onDraftChange: setPresellDraft,
              loadError: presellLoadError,
            } : undefined}
            menuEngineeringEnabled={menuEngineeringEnabled}
            boosts={boosts}
            onBoostsChange={setBoosts}
            branchesSlot={branchesPanel}
          />

          {item && (
            <DeleteDishSection itemId={item.id} itemName={item.name} tenantId={tenantId} tenantSlug={tenantSlug} />
          )}
        </div>

        {/* Beside the form on a wide screen: the dish as a customer sees it, and where everything is. */}
        <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:space-y-4 lg:overflow-y-auto">
          <DishPreviewCard
            basics={basics}
            categoryName={categoryName}
            isAvailable={isAvailable}
            isFeatured={isFeatured}
            optionLines={optionLines}
          />
          <SectionNavList entries={navEntries} />
        </aside>
      </div>

      <SaveBar
        formId={FORM_ID}
        isSaving={isSubmitting}
        isNew={!item}
        onCancel={() => router.push(`/${tenantSlug}/admin/menu`)}
      />

      {/*
        The recipe step for a freshly created dish. Dismissing it in any way —
        Done, Skip, the close button — lands on the menu list either way; the
        dialog only decides whether the dish leaves linked to inventory.
      */}
      <Dialog
        open={recipeStepItemId !== null}
        onOpenChange={(open) => !open && !isRecipeSaving && finishRecipeStep()}
      >
        <DialogContent
          className="max-h-[85dvh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-y-auto"
          showCloseButton={!isRecipeSaving}
        >
          <DialogHeader>
            <DialogTitle>Link ingredients now?</DialogTitle>
            <DialogDescription>
              {basics.name || 'This dish'} is saved. Until it has a recipe, selling it will not
              deduct any stock from your inventory.
            </DialogDescription>
          </DialogHeader>
          {recipeStepItemId && (
            <RecipeEditor
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              target={{ type: 'menu_item', menuItemId: recipeStepItemId }}
              label="Ingredients used per order"
              onSavingChange={setIsRecipeSaving}
            />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="max-sm:h-11"
              onClick={finishRecipeStep}
              disabled={isRecipeSaving}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              className="max-sm:h-11"
              onClick={finishRecipeStep}
              disabled={isRecipeSaving}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
