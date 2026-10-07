'use client'

/**
 * The add / edit dish screen, laid out the way Shopify lays out a product:
 * what defines the dish in the main column (details, pricing, options), its
 * status, preview and section list in a sidebar. On a phone the sidebar's
 * status card sits after pricing and the preview opens as a sheet.
 *
 * One contextual save bar covers everything in the form. It appears when the
 * owner has changed something, offers Discard, and the editor stays put after
 * saving an edit. Leaving with unsaved changes asks first.
 *
 * `MenuItemForm` is a thin session wrapper: Discard and "Save & add another"
 * start a fresh editor by remounting it, which resets every piece of state at
 * once instead of hand-resetting a dozen hooks.
 */

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { MenuItem, Category, BcgClassification, ModifierGroup, PresellStock } from '@/types/database'
import { AddonLibraryPicker } from '@/components/admin/addon-library-picker'
import { ModifierGroupsEditor, type LinkableMenuItem } from '@/components/admin/modifier-groups-editor'
import { ModifierLibraryPicker } from '@/components/admin/modifier-library-picker'
import { syncPresellAllocationsAction } from '@/app/actions/presell'
import { draftFromRows, diffDraft, type DraftAllocation } from '@/lib/presell/allocation-draft'
import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { serializeGroups, splitGroupsToLegacyColumns, omitUnchangedOptionStock } from '@/lib/modifier-groups-form'
import { attachEntriesToAddons } from '@/lib/addon-library-utils'
import { attachEntriesToGroups, buildLibraryDraftFromGroup } from '@/lib/modifier-library-utils'
import { createModifierGroupLibraryEntryAction } from '@/app/actions/modifier-library'
import { describeActionError, runServerAction } from '@/components/admin/server-action-safety'
import { useMenuItemCosts } from '@/hooks/use-menu-item-costs'
import { resolvePostSaveStep } from '@/lib/menu-item-save-flow'
import {
  describeMissingFields,
  dishFormSchema,
  errorsFromIssues,
  initialCategoryId,
  type DishBasics,
  type DishBasicsErrors,
} from '@/lib/menu-editor/dish-form-schema'
import { isDraftChanged, serializeDraft } from '@/lib/menu-editor/dish-draft'
import { DishDetailsSection, DishPricingSection } from '@/components/admin/menu-editor/dish-basics-section'
import { DishMoreOptions, type DishBoosts } from '@/components/admin/menu-editor/dish-more-options'
import { LegacyOptionsSections } from '@/components/admin/menu-editor/legacy-options-sections'
import { useLegacyOptions } from '@/components/admin/menu-editor/use-legacy-options'
import { SaveBar, type SaveIntent } from '@/components/admin/menu-editor/save-bar'
import {
  DishPreviewCard,
  DishPreviewSheet,
  DishStatusCard,
  SectionNavChips,
  SectionNavList,
} from '@/components/admin/menu-editor/dish-editor-rail'
import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'
import { describeChoiceCount, summarizeLegacyOptions, summarizeModifierGroups } from '@/lib/menu-editor/option-summary'
import { buildSectionNav } from '@/lib/menu-editor/section-nav'
import { DeleteDishSection } from '@/components/admin/menu-editor/delete-dish-section'
import { RecipeStepDialog } from '@/components/admin/menu-editor/recipe-step-dialog'
import { useLeaveGuard } from '@/components/admin/menu-editor/use-leave-guard'

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
  /** Only for stores whose orders live on Convex — where the cost field persists. */
  convexUrl?: string
  /** The per-branch panel, which saves on its own and so lives outside the form. */
  branchesPanel?: ReactNode
  /** A new dish starts in this category (e.g. "Add" from a category on the menu list). */
  defaultCategoryId?: string
}

const FORM_ID = 'menu-item-form'

interface EditorSession {
  key: number
  item?: MenuItem
  /** Pre-order dates as last saved in this session; overrides the page's read. */
  presellDraft?: DraftAllocation[]
  defaultCategoryId?: string
}

export function MenuItemForm(props: MenuItemFormProps) {
  const [session, setSession] = useState<EditorSession>(() => ({
    key: 0,
    item: props.item,
    defaultCategoryId: props.defaultCategoryId,
  }))

  return (
    <DishEditor
      key={session.key}
      {...props}
      item={session.item}
      defaultCategoryId={session.defaultCategoryId}
      presellDraftOverride={session.presellDraft}
      onCommitted={(item, presellDraft) => setSession((prev) => ({ ...prev, item, presellDraft }))}
      onRestart={(next) => setSession((prev) => ({ ...prev, ...next, key: prev.key + 1 }))}
    />
  )
}

interface DishEditorProps extends MenuItemFormProps {
  presellDraftOverride?: DraftAllocation[]
  /** An edit landed: this is the dish as now saved. */
  onCommitted: (item: MenuItem, presellDraft: DraftAllocation[]) => void
  /** Start a fresh editor (Discard, or Save & add another). */
  onRestart: (next: Partial<Omit<EditorSession, 'key'>>) => void
}

function focusField(field: keyof DishBasics | undefined) {
  if (!field) return
  const elementId = field === 'category_id' ? 'category' : field
  document.getElementById(elementId)?.focus()
}

function DishEditor({
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
  defaultCategoryId,
  presellDraftOverride,
  onCommitted,
  onRestart,
}: DishEditorProps) {
  const router = useRouter()
  const isNew = !item
  const [persistedItemId, setPersistedItemId] = useState(item?.id)
  const [stockBaseline, setStockBaseline] = useState<ModifierGroup[]>(item?.modifier_groups ?? [])
  // Recipe-derived costs for the margin displays. No-ops when the tenant has
  // no inventory or the item has not been saved yet.
  const { optionRecipeCosts, baseRecipeCost, refresh: refreshCosts } = useMenuItemCosts(tenantId, item?.id, inventoryEnabled)

  const [basics, setBasics] = useState<DishBasics>({
    name: item?.name || '',
    description: item?.description || '',
    price: item?.price.toString() || '',
    discounted_price: item?.discounted_price?.toString() || '',
    image_url: item?.image_url || '',
    category_id: item?.category_id || initialCategoryId(categories, defaultCategoryId),
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
  // Seeded from the item's existing modifiers (explicit modifier_groups OR
  // derived from legacy variation_types/variations/addons).
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(() =>
    modifierGroupsEnabled ? normalizeModifierGroups(item ?? {}) : []
  )
  const [errors, setErrors] = useState<DishBasicsErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const saveIntent = useRef<SaveIntent>('default')
  /**
   * The freshly created item whose recipe step is open. On an inventory store
   * a dish with no recipe deducts nothing when it sells, so creating holds the
   * owner here for it. See `resolvePostSaveStep`.
   */
  const [recipeStepItemId, setRecipeStepItemId] = useState<string | null>(null)
  /**
   * Pre-order dates, staged like every other field. `savedAllocations` is the
   * baseline the save diffs against; `presellDraft` is what the owner has now.
   */
  const [savedAllocations, setSavedAllocations] = useState<DraftAllocation[]>(() =>
    presellDraftOverride ?? draftFromRows(presellAllocations ?? []),
  )
  const [presellDraft, setPresellDraft] = useState<DraftAllocation[]>(savedAllocations)

  // Everything the save bar covers. Panels that save on their own (branches,
  // recipes, tags) are deliberately not here.
  const draft = {
    basics,
    isAvailable,
    isFeatured,
    isPresellOn,
    boosts,
    modifierGroups,
    presellDraft,
    legacy: modifierGroupsEnabled
      ? null
      : { variations: legacy.variations, variationTypes: legacy.variationTypes, addons: legacy.addons },
  }
  const [baseline, setBaseline] = useState(() => serializeDraft(draft))
  const isDirty = isDraftChanged(baseline, draft)
  const leaveGuard = useLeaveGuard(isDirty && !isSubmitting)

  const updateBasics = <K extends keyof DishBasics>(field: K, value: DishBasics[K]) => {
    setBasics((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validateForm = (): boolean => {
    const parsed = dishFormSchema.safeParse(basics)
    if (parsed.success) {
      setErrors({})
      return true
    }
    setErrors(errorsFromIssues(parsed.error.issues))
    toast.error(parsed.error.issues[0]?.message ?? 'Please check the highlighted fields.')
    focusField(parsed.error.issues[0]?.path[0] as keyof DishBasics | undefined)
    return false
  }

  /** Persists staged pre-order dates; returns a message when the write was refused. */
  const savePresellDraft = async (menuItemId: string): Promise<string | undefined> => {
    const { upserts, deletes } = diffDraft(savedAllocations, presellDraft)
    if (upserts.length === 0 && deletes.length === 0) return undefined

    const result = await syncPresellAllocationsAction(tenantId, tenantSlug, { menuItemId, upserts, deletes })
    if (!result.success) return result.error || 'Failed to save the pre-order dates'
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
      variation_types: legacyColumns
        ? legacyColumns.variation_types
        : legacy.useGroupedVariations ? legacy.variationTypes : [],
      variations: legacyColumns ? legacyColumns.variations : legacy.useGroupedVariations ? [] : legacy.variations,
      addons: legacyColumns ? legacyColumns.addons : legacy.addons,
      is_available: isAvailable,
      is_featured: isFeatured,
      show_in_checkout_upsell: boosts.show_in_checkout_upsell,
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
        setErrors(errorsFromIssues(errorData))
        toast.error('Please fix the highlighted fields.')
        return
      }
      toast.error(error)
    } catch {
      toast.error(error)
    }
  }

  /** Where a new dish goes once it is saved (and its recipe step, if any, is done). */
  const leaveNewDish = () => {
    if (saveIntent.current === 'add-another') {
      toast.success(`${basics.name} added. Next dish:`)
      onRestart({ item: undefined, presellDraft: [], defaultCategoryId: basics.category_id })
      return
    }
    router.push(`/${tenantSlug}/admin/menu`)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const savedDraft = serializeDraft(draft)
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
      // The dates land with the dish. If they do not, the owner stays here:
      // navigating away would discard a draft that only exists in this state.
      if (presellEnabled && savedItemId && !presellLoadError) {
        const allocationError = await savePresellDraft(savedItemId)
        if (allocationError) {
          toast.error(allocationError)
          return
        }
      }

      // Saved: nothing on screen is unsaved any more, so the bar and the leave
      // guard stand down — including during a new dish's recipe step.
      setBaseline(savedDraft)

      if (!isNew && savedItemId) {
        // An edit stays on the dish: the bar clears and the owner can keep going.
        onCommitted({ ...item, ...input, modifier_groups: cleanGroups, id: savedItemId } as MenuItem, presellDraft)
        toast.success('Saved')
        router.refresh()
        return
      }

      const step = resolvePostSaveStep({ isNewItem: true, inventoryEnabled, savedItemId })
      if (step.kind === 'link-ingredients') {
        toast.success(`${basics.name} added to your menu`)
        setRecipeStepItemId(step.itemId)
        return
      }
      if (saveIntent.current !== 'add-another') toast.success(`${basics.name} added to your menu`)
      leaveNewDish()
    } catch (error) {
      // Includes Next's "unexpected response" rejection; `describeActionError`
      // turns it into the real instruction (reload and sign in again).
      toast.error(describeActionError(error))
    } finally {
      setIsSubmitting(false)
    }
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
    const libraryDraft = buildLibraryDraftFromGroup(group)
    if (!libraryDraft.name.trim()) {
      toast.error('Give the group a name before saving it to the library')
      return
    }
    if (libraryDraft.options.length === 0) {
      toast.error('Add at least one option before saving to the library')
      return
    }
    // Called from an onClick that drops the promise, so it must never reject.
    const outcome = await runServerAction(() =>
      createModifierGroupLibraryEntryAction(tenantId, tenantSlug, libraryDraft)
    )
    if (!outcome.ok) {
      toast.error(outcome.message)
      return
    }
    if (!outcome.value.success) {
      toast.error(outcome.value.error ?? 'Failed to save group to library')
      return
    }
    toast.success(`"${libraryDraft.name}" saved to your modifier library`)
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
  const missing = describeMissingFields(basics)
  const navEntries = buildSectionNav({
    missingDetailCount: missing.detailCount,
    isPriceMissing: missing.isPriceMissing,
    isAvailable,
    hasUnifiedOptions: Boolean(modifierGroupsEnabled),
    choiceStatus: describeChoiceCount(legacy.useGroupedVariations, choiceCount),
    addonCount: legacy.addons.length,
    optionGroupCount: modifierGroups.length,
  })
  const categoryName = categories.find((category) => category.id === basics.category_id)?.name
  const preview = { basics, categoryName, isAvailable, isFeatured, optionLines }
  const statusProps = {
    isAvailable,
    isFeatured,
    onAvailableChange: setIsAvailable,
    onFeaturedChange: setIsFeatured,
  }

  return (
    <div className="mx-auto max-w-6xl">
      <SectionNavChips entries={navEntries} leading={<DishPreviewSheet {...preview} />} />

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
            <DishDetailsSection values={basics} errors={errors} categories={categories} onChange={updateBasics} />
            <DishPricingSection
              values={basics}
              errors={errors}
              onChange={updateBasics}
              recipeCost={baseRecipeCost ?? null}
            />
            <DishStatusCard idPrefix="dish-m" sectionId={DISH_SECTION_IDS.availability} className="lg:hidden" {...statusProps} />

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

        <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:space-y-4 lg:overflow-y-auto">
          <DishStatusCard idPrefix="dish-d" {...statusProps} />
          <DishPreviewCard {...preview} />
          <SectionNavList entries={navEntries.filter((entry) => entry.id !== DISH_SECTION_IDS.availability)} />
        </aside>
      </div>

      <SaveBar
        formId={FORM_ID}
        isSaving={isSubmitting}
        isNew={isNew}
        isDirty={isDirty}
        onDiscard={() => onRestart({})}
        onIntent={(intent) => {
          saveIntent.current = intent
        }}
      />

      <RecipeStepDialog
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        itemId={recipeStepItemId}
        dishName={basics.name}
        onFinish={leaveNewDish}
      />
      {leaveGuard.dialog}
    </div>
  )
}
