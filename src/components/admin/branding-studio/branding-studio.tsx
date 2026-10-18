'use client'

/**
 * Branding Studio — the tenant branding editor at /[tenant]/admin/branding.
 *
 * Replaces the old pencil-buttons + modal overlay on the storefront. Layout
 * follows the Branding Editor design spec: top bar (device toggle + Publish),
 * dark icon rail of surfaces, accordion settings panel with inherit-aware
 * fields, and a live pixel-exact preview of the real storefront (iframe
 * bridge — see preview-frame.tsx / use-branding-preview.ts).
 */

import { JourneyBar } from './journey-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BRANDING_SURFACES,
  BRANDING_PRESETS,
  getInheritSourceLabel,
  getSurfaceFieldIds,
  generatePaletteFromColor,
  isFieldSet,
  resolveFieldValue,
  editsTenantColumn,
  isFieldVisible,
  type BrandingField,
  type BrandingSurface,
} from '@/lib/branding-registry'
import { getTenantBranding } from '@/lib/branding-utils'
import { saveBrandingAction } from '@/app/actions/branding'
import { withPackSettingsPreview } from '@/lib/storefront-pack-studio'
import { withJsonColumnsPreview } from '@/lib/branding-studio/studio-columns'
import type { BrandingInput } from '@/lib/branding-service'
import {
  getProductDetailFieldIds,
  createProductFieldResolver,
  isProductFieldSet,
} from '@/lib/product-detail-registry'
import { saveProductDetailSettings } from '@/app/actions/product-detail-settings'
import {
  PRODUCT_SURFACE_SECTIONS,
  PRODUCT_SURFACE_TENANT_FIELD_IDS,
  isProductSurfaceTenantField,
} from '@/lib/branding-studio/product-surface'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import {
  applyMobileOverrides,
  mergeMobileOverrides,
  resolveMobileFieldValue,
} from '@/lib/mobile-overrides'
import {
  getBrandingSectionAnchorId,
  getBrandingFieldAnchorId,
  labelScope,
} from '@/lib/branding-inspect'
import type { StorefrontLabelKey } from '@/lib/storefront-labels'
import {
  hasCategoryDraftChanges,
} from '@/lib/category-studio'
import { reorderCategoriesAction, updateCategoryAction } from '@/app/actions/categories'
import { publishStudio } from '@/lib/branding-studio/publish-studio'
import { createTenantColorResolver } from '@/lib/branding-studio/tenant-field-effective'
import { listTenantContrastIssues } from '@/lib/branding-studio/tenant-contrast'
import type { StoreColor } from './color-picker'
import { ContrastSummary } from './contrast-summary'
import { PreviewStateBar } from './preview-state-bar'
import { previewStatesForField, type ProductPreviewState } from '@/lib/branding-studio/preview-states'
import { componentBreadcrumb, getBrandingComponent } from '@/lib/branding-components'
import { FieldRow } from './field-row'
import { ComponentPanel, EditModeToggle, SettingsSearch, matchesSettingQuery } from './component-panel'
import { SettingsSheet, SurfaceRail, previewInsetFor, type SheetSize } from './studio-shell'
import { ChangesMenu, HistoryButtons, RestoreBanner } from './changes-menu'
import { useStudioDrafts } from './use-studio-drafts'
import { PreviewFrame } from './preview-frame'
import { CategoryLayoutPanel } from './category-layout-panel'
import type { GalleryContext } from './template-gallery'
import type { Category, MenuItem, Tenant } from '@/types/database'

const PUBLISHED_TOAST_MS = 2500
/** Below Tailwind's md breakpoint the Studio switches to its phone layout. */
const PHONE_EDITOR_QUERY = '(max-width: 767px)'
const NO_SAMPLE_DISHES: readonly MenuItem[] = []
/** Screens whose preview needs a cart with something in it. */
const CART_SURFACES = new Set<BrandingSurface['id']>(['cart', 'upsell', 'checkout'])

interface BrandingStudioProps {
  tenant: Tenant
  tenantSlug: string
  /** A real menu item id so the Product surface can preview the item page. */
  sampleItemId?: string | null
  /** The tenant's menu items, for the hero featured-product picker. */
  products?: readonly { id: string; name: string }[]
  /** Saved product_detail_settings row — the Product surface's saved snapshot. */
  productSettings?: Partial<ProductDetailSettings> | null
  /** The tenant's menu categories, for the Menu Layout surface. */
  categories?: Category[]
  /** A real dish (ideally with a photo) the card-template gallery renders. */
  sampleMenuItem?: MenuItem | null
  /** Surface to open first (e.g. "product" from a dish's "Edit look"). */
  initialSurfaceId?: BrandingSurface['id']
  /** Dishes for the cart/checkout previews when the owner's own cart is empty. */
  sampleCartItems?: readonly MenuItem[]
}

/** Stand-in dish for the card gallery when the menu is still empty. */
const PLACEHOLDER_SAMPLE_ITEM = {
  id: 'gallery-sample',
  name: 'Your signature dish',
  description: 'How your menu cards will look with this design.',
  price: 180,
  image_url: '',
  variations: [],
  addons: [],
  is_available: true,
} as unknown as MenuItem

export function BrandingStudio({ tenant, tenantSlug, sampleItemId, productSettings, products = [], categories = [], sampleMenuItem, initialSurfaceId, sampleCartItems = [] }: BrandingStudioProps) {
  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products]
  )
  const router = useRouter()
  const [surfaceId, setSurfaceId] = useState<BrandingSurface['id']>(initialSurfaceId ?? 'storefront')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  // Phone: the settings are a bottom sheet over the preview.
  const [sheetSize, setSheetSize] = useState<SheetSize>('peek')
  // On a phone the preview is the phone: start on the mobile layout.
  useEffect(() => {
    if (window.matchMedia?.(PHONE_EDITOR_QUERY).matches) setDevice('mobile')
  }, [])
  // Every unpublished edit, undoable, kept in the browser until published.
  const studio = useStudioDrafts({ tenant, productSettings, categories })
  const {
    drafts,
    savedTenant,
    savedProduct,
    savedMobile,
    savedMobileProduct,
    savedCategories,
    changes,
  } = studio
  const draft = drafts.tenant
  const productDraft = drafts.product
  const mobileDraft = drafts.mobile
  const mobileProductDraft = drafts.mobileProduct
  const categoryDraft = drafts.categories
  const [isPublishing, setIsPublishing] = useState(false)
  const publishingRef = useRef(false)
  const [showPublishedToast, setShowPublishedToast] = useState(false)
  // Tap-to-edit: in Edit mode a tap in the preview selects that part and the
  // panel shows only its settings; Try it lets the preview behave like the store.
  const [isEditing, setIsEditing] = useState(true)
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null)
  const [settingQuery, setSettingQuery] = useState('')
  // Item-page samples the owner switched on, and the setting last edited (its
  // samples stay on so the change stays visible after the pointer moves).
  const [chosenStates, setChosenStates] = useState<ReadonlySet<ProductPreviewState>>(() => new Set())
  const [lastEditedFieldId, setLastEditedFieldId] = useState<string | null>(null)
  // Cart preview: sample dishes, or the empty cart.
  const [isCartEmptyPreview, setIsCartEmptyPreview] = useState(false)
  const [cartView, setCartView] = useState<'drawer' | 'page'>('drawer')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectedScopeRef = useRef(selectedScope)
  selectedScopeRef.current = selectedScope

  const isMobile = device === 'mobile'

  // The preview's tenant merge is a shallow spread, so pack setting edits
  // must reach it as the whole folded storefront_pack_settings object.
  const previewDraft = useMemo(
    () => withJsonColumnsPreview(withPackSettingsPreview(draft, savedTenant), savedTenant),
    [draft, savedTenant]
  )

  // Product Detail rows resolve through the product page's own merge, against
  // the desktop brand the merchant is editing right now.
  const desktopBranding = useMemo(() => getTenantBranding({ ...savedTenant, ...draft }), [savedTenant, draft])
  // Store-wide rows show what the storefront renders (palette, legacy brand
  // colour, modal → cards fallbacks), not just the registry's own chain.
  const tenantColor = useMemo(() => createTenantColorResolver(draft, savedTenant), [draft, savedTenant])
  // The store's own colours, offered first in every colour picker.
  const storeColors = useMemo<StoreColor[]>(() => [
    { label: 'Brand', color: desktopBranding.accent },
    { label: 'Main', color: desktopBranding.primary },
    { label: 'Button', color: desktopBranding.buttonPrimary },
    { label: 'Page', color: desktopBranding.background },
    { label: 'Cards', color: desktopBranding.cards },
    { label: 'Text', color: desktopBranding.textPrimary },
    { label: 'Soft text', color: desktopBranding.textSecondary },
    { label: 'Lines', color: desktopBranding.border },
  ].filter((entry): entry is StoreColor => typeof entry.color === 'string' && entry.color.length > 0), [desktopBranding])
  const contrastIssues = useMemo(() => listTenantContrastIssues(draft, savedTenant), [draft, savedTenant])
  const productFields = useMemo(
    () => createProductFieldResolver(productDraft, savedProduct, desktopBranding),
    [productDraft, savedProduct, desktopBranding]
  )

  // The card gallery previews with the colors and card-style knobs the
  // merchant is editing right now, on the device they are editing for.
  const galleryContext = useMemo<GalleryContext>(() => {
    const desktopTenant = { ...savedTenant, ...draft }
    const effectiveTenant = isMobile
      ? applyMobileOverrides(desktopTenant, mergeMobileOverrides(savedMobile, mobileDraft))
      : desktopTenant
    return { sampleItem: sampleMenuItem ?? PLACEHOLDER_SAMPLE_ITEM, branding: getTenantBranding(effectiveTenant) }
  }, [savedTenant, draft, isMobile, savedMobile, mobileDraft, sampleMenuItem])

  // A field's current value as the editor shows it: the mobile layer on the
  // mobile tab (unless the field always edits its column), else the desktop.
  const resolveEditorValue = useCallback((fieldId: string) => {
    const desktopValue = resolveFieldValue(fieldId, draft, savedTenant)
    return isMobile ? resolveMobileFieldValue(fieldId, mobileDraft, savedMobile, desktopValue) : desktopValue
  }, [draft, savedTenant, isMobile, mobileDraft, savedMobile])

  const surface = useMemo(
    () => BRANDING_SURFACES.find((s) => s.id === surfaceId) ?? BRANDING_SURFACES[0],
    [surfaceId]
  )
  const isProductSurface = surface.id === 'product'
  const isCategoriesSurface = surface.id === 'categories'
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 0: true })

  const isDirty = changes.length > 0

  // Guard against losing unsaved changes on tab close / hard navigation.
  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const { setField, clearField, clearFields, undo, redo } = studio
  const setFieldValue = useCallback((fieldId: string, value: unknown) => setField('tenant', fieldId, value), [setField])
  const clearFieldValue = useCallback((fieldId: string) => clearField('tenant', fieldId), [clearField])
  const setProductFieldValue = useCallback((fieldId: string, value: unknown) => setField('product', fieldId, value), [setField])
  const clearProductFieldValue = useCallback((fieldId: string) => clearField('product', fieldId), [clearField])
  const setMobileFieldValue = useCallback((fieldId: string, value: unknown) => setField('mobile', fieldId, value), [setField])
  const clearMobileFieldValue = useCallback((fieldId: string) => clearField('mobile', fieldId), [clearField])
  const setMobileProductFieldValue = useCallback((fieldId: string, value: unknown) => setField('mobileProduct', fieldId, value), [setField])
  const clearMobileProductFieldValue = useCallback((fieldId: string) => clearField('mobileProduct', fieldId), [clearField])

  // ⌘Z / ⇧⌘Z undo/redo, ⌘K find a setting, Esc steps out of the selection.
  // Text boxes keep their own typing undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable === true
        || (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'color')
      const key = event.key.toLowerCase()
      // A popover or menu that handled the key owns it.
      if (event.defaultPrevented || target?.closest('[role="dialog"], [role="menu"], [data-studio-popover]')) return
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        if (!searchInputRef.current && !selectedScopeRef.current) return
        event.preventDefault()
        setSelectedScope(null)
        // The search box mounts once the full list is back.
        window.requestAnimationFrame(() => searchInputRef.current?.focus())
        return
      }
      if (key === 'escape' && !isTyping) {
        setSelectedScope((current) => (current ? getBrandingComponent(current)?.parent ?? null : null))
        return
      }
      if (!(event.metaKey || event.ctrlKey) || key !== 'z' || isTyping) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const pickSurface = useCallback((id: BrandingSurface['id']) => {
    setSurfaceId(id)
    setOpenSections({ 0: true })
    setSelectedScope(null)
    setSettingQuery('')
    setHoveredFieldId(null)
  }, [])

  // A part of the preview was tapped: show its screen and only its settings.
  const handleScopeSelected = useCallback((scope: string) => {
    const component = getBrandingComponent(scope)
    if (!component) {
      toast.error('No settings are mapped to that part yet')
      return
    }
    setSurfaceId(component.surfaceId)
    setSelectedScope(component.id)
    setSettingQuery('')
    setHoveredFieldId(null)
    setSheetSize((size) => (size === 'peek' ? 'half' : size))
  }, [])

  // A label retyped on the page: same draft as its settings row, then open that row.
  const handleLabelEdited = useCallback((key: StorefrontLabelKey, text: string) => {
    const fieldId = `storefront_labels.${key}`
    if (text) setFieldValue(fieldId, text)
    else clearFieldValue(fieldId)
    handleScopeSelected(labelScope(key))
  }, [setFieldValue, clearFieldValue, handleScopeSelected])

  // Panel navigation: a breadcrumb or "All … settings" — null = the whole screen.
  const selectScope = useCallback((scope: string | null) => {
    setSelectedScope(scope)
    setHoveredFieldId(null)
    if (!scope) setOpenSections({ 0: true })
  }, [])

  const applyValues = useCallback((values: Record<string, string>) => studio.applyValues('tenant', values), [studio])

  const resetSurface = useCallback(() => {
    if (isCategoriesSurface) {
      studio.setCategories({})
      return
    }
    // The item page's store-wide wording is one value for every device.
    if (isProductSurface && !isMobile) clearFields('tenant', [...PRODUCT_SURFACE_TENANT_FIELD_IDS])
    const fieldIds = isProductSurface ? getProductDetailFieldIds() : getSurfaceFieldIds(surface.id)
    // On the phone tab: back to the computer values. Otherwise: back to defaults
    // (toggles and choices to their default value, never '').
    const store = isMobile
      ? (isProductSurface ? 'mobileProduct' : 'mobile')
      : (isProductSurface ? 'product' : 'tenant')
    clearFields(store, fieldIds)
  }, [surface.id, isProductSurface, isCategoriesSurface, isMobile, clearFields, studio])

  const handlePublish = useCallback(async () => {
    // A ref, not state: a fast double-click must not start two publishes.
    if (publishingRef.current) return
    publishingRef.current = true
    setIsPublishing(true)
    try {
      const result = await publishStudio(
        {
          saveTenant: (patch) => saveBrandingAction(tenant.id, tenantSlug, patch as BrandingInput),
          saveProduct: (patch) => saveProductDetailSettings(tenant.id, tenantSlug, patch as Partial<ProductDetailSettings>),
          reorderCategories: (orderedIds) => reorderCategoriesAction(tenant.id, tenantSlug, orderedIds),
          updateCategory: (categoryId, input) => updateCategoryAction(categoryId, tenant.id, tenantSlug, input),
        },
        { drafts, saved: studio.saved, categories: savedCategories }
      )
      studio.markPublished(
        { ...result.published, categories: result.publishedCategories ?? undefined },
        drafts,
        result.nextMobile,
        result.nextMobileProduct
      )
      result.warnings.forEach((warning) => toast.warning(warning))
      if (result.failures.length > 0) {
        // Parts that saved stay saved; the rest keeps its draft for a retry.
        result.failures.forEach((failure) => toast.error(`${failure.part} didn't save: ${failure.error}. Press Publish to try again.`))
      } else {
        setShowPublishedToast(true)
        window.setTimeout(() => setShowPublishedToast(false), PUBLISHED_TOAST_MS)
      }
      if (result.published.tenant || result.published.product || result.publishedCategories) router.refresh()
    } finally {
      publishingRef.current = false
      setIsPublishing(false)
    }
  }, [tenant.id, tenantSlug, drafts, studio, savedCategories, router])

  const surfaceFieldIds = isProductSurface ? getProductDetailFieldIds() : getSurfaceFieldIds(surface.id)
  const surfaceHasOverrides = isCategoriesSurface
    ? hasCategoryDraftChanges(categoryDraft)
    : isMobile
    ? surfaceFieldIds.some((id) => isFieldSet(id, isProductSurface ? mobileProductDraft : mobileDraft, isProductSurface ? savedMobileProduct : savedMobile))
    : isProductSurface
      ? getProductDetailFieldIds().some((id) => isProductFieldSet(id, productDraft, savedProduct))
        || PRODUCT_SURFACE_TENANT_FIELD_IDS.some((id) => isFieldSet(id, draft, savedTenant))
      : getSurfaceFieldIds(surface.id).some((id) => isFieldSet(id, draft, savedTenant))

  const [logoColor, setLogoColor] = useState('#E4572E')

  const panelSections = isProductSurface ? PRODUCT_SURFACE_SECTIONS : surface.sections
  const automaticStates = new Set<ProductPreviewState>(
    isProductSurface
      ? [hoveredFieldId, lastEditedFieldId, ...(selectedScope ? getBrandingComponent(selectedScope)?.fieldIds ?? [] : [])]
          .filter((fieldId): fieldId is string => Boolean(fieldId))
          .flatMap(previewStatesForField)
      : []
  )
  // A stable list (by content), so the preview isn't re-posted on every render.
  const previewStatesKey = isProductSurface ? [...new Set([...chosenStates, ...automaticStates])].sort().join(',') : ''
  const previewStates = useMemo(() => (previewStatesKey ? previewStatesKey.split(',') : []), [previewStatesKey])
  const toggleState = (state: ProductPreviewState) =>
    setChosenStates((current) => {
      const next = new Set(current)
      if (next.has(state)) next.delete(state)
      else next.add(state)
      return next
    })
  const tappedComponent = selectedScope ? getBrandingComponent(selectedScope) : null
  const selectedComponent = tappedComponent?.surfaceId === surface.id ? tappedComponent : null
  const isFieldShown = (field: BrandingField) =>
    (!field.mobileOnly || device === 'mobile') && (isProductSurface || isFieldVisible(field, resolveEditorValue))

  // One settings row, wherever it is shown (component panel or full list).
  const renderField = (field: BrandingField) => {
    // Desktop-resolved value first — mobile rows fall back to it when they
    // have no override of their own.
    // The item page's wording is a tenant column, edited like any other screen's.
    const isProductField = isProductSurface && !isProductSurfaceTenantField(field.id)
    const productField = isProductField ? productFields.effective(field.id) : null
    const desktopIsSet = productField ? productField.isSet : isFieldSet(field.id, draft, savedTenant)
    const desktopValue = productField
      ? productField.value
      : (!desktopIsSet && tenantColor(field.id)) || resolveFieldValue(field.id, draft, savedTenant)
    const desktopInherit = productField ? productField.inheritLabel : getInheritSourceLabel(field.id, draft, savedTenant)
    const activeMobileDraft = isProductField ? mobileProductDraft : mobileDraft
    const activeSavedMobile = isProductField ? savedMobileProduct : savedMobile
    // Column-backed fields (e.g. mobile_grid_columns) always edit their real
    // tenant column, even on the mobile tab — the storefront reads it directly.
    const usesMobilePath = !editsTenantColumn(field, isMobile)

    return (
      <div
        key={field.id}
        id={getBrandingFieldAnchorId(field.id)}
        className="rounded-md"
        onMouseEnter={() => setHoveredFieldId(field.id)}
        onMouseLeave={() => setHoveredFieldId((current) => (current === field.id ? null : current))}
      >
        <FieldRow
          field={field}
          productOptions={productOptions}
          gallery={galleryContext}
          value={
            usesMobilePath
              ? resolveMobileFieldValue(field.id, activeMobileDraft, activeSavedMobile, desktopValue)
              : desktopValue
          }
          isSet={usesMobilePath ? isFieldSet(field.id, activeMobileDraft, activeSavedMobile) : desktopIsSet}
          inheritLabel={usesMobilePath ? 'Desktop' : desktopInherit}
          onChange={(value) => {
            if (isProductSurface) setLastEditedFieldId(field.id)
            return usesMobilePath
              ? (isProductField ? setMobileProductFieldValue : setMobileFieldValue)(field.id, value)
              : (isProductField ? setProductFieldValue : setFieldValue)(field.id, value)
          }}
          onClear={() =>
            usesMobilePath
              ? (isProductField ? clearMobileProductFieldValue : clearMobileFieldValue)(field.id)
              : (isProductField ? clearProductFieldValue : clearFieldValue)(field.id)
          }
          contrastIssue={
            usesMobilePath
              ? null
              : productField
                ? productFields.contrastIssue(field.id)
                : contrastIssues.find((issue) => issue.fieldId === field.id) ?? null
          }
          storeColors={storeColors}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] font-sans text-[#1D1815]">
      {/* ============ TOP BAR ============ */}
      <div className="z-20 flex h-[54px] flex-shrink-0 items-center gap-2 border-b border-[#E5E0D6] bg-white px-2 md:gap-4 md:px-4">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/${tenantSlug}/admin`}
            className="flex h-[26px] items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Back to admin"
          >
            ← Admin
          </Link>
          <div className="flex h-[26px] max-md:hidden w-[26px] items-center justify-center rounded-lg bg-[#1D1815] text-[13px] font-black text-white">
            W
          </div>
          <div className="text-[14px] font-extrabold max-md:hidden">Branding Studio</div>
          <div className="border-l border-[#E5E0D6] pl-3 text-[12px] font-semibold text-[#8B857B] max-lg:hidden">
            {tenant.name}
          </div>
        </div>

        <div className="flex-1" />

        <HistoryButtons canUndo={studio.canUndo} canRedo={studio.canRedo} onUndo={undo} onRedo={redo} />

        <EditModeToggle isEditing={isEditing} onChange={setIsEditing} />

        {/* device toggle */}
        <div className="flex gap-0.5 rounded-full bg-[#EFECE6] p-[3px] max-md:hidden">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold capitalize transition-colors ${
                device === d ? 'bg-white text-[#1D1815] shadow-sm' : 'text-[#8B857B]'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {showPublishedToast ? (
          <div className="text-[12px] font-bold text-emerald-700">✓ Published</div>
        ) : (
          <ChangesMenu changes={changes} onRevert={studio.revert} onDiscardAll={studio.discardAll} />
        )}
        <button
          type="button"
          onClick={handlePublish}
          disabled={isPublishing || !isDirty}
          className="whitespace-nowrap rounded-full bg-[#1D1815] px-4 py-2 text-[13px] font-extrabold text-white md:px-5 transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {isPublishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {studio.pendingRestore && (
        <RestoreBanner
          savedAt={studio.pendingRestore.savedAt}
          onRestore={studio.restore}
          onDismiss={studio.dismissRestore}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ============ SCREENS (rail on a computer, chips on a phone) ============ */}
        <SurfaceRail surfaces={BRANDING_SURFACES} activeId={surface.id} onPick={pickSurface} />

        {/* ============ SETTINGS PANEL ============ */}
        <SettingsSheet size={sheetSize} onSizeChange={setSheetSize} title={surface.label}>
          <div className="border-b border-[#E5E0D6] px-[18px] pb-3 pt-4 max-md:pt-1">
            <div className="flex items-baseline gap-2.5">
              <div className="text-[16px] font-extrabold">{surface.label}</div>
              <div className="flex-1" />
              {surfaceHasOverrides && (
                <button
                  type="button"
                  onClick={resetSurface}
                  className="text-[11.5px] font-bold text-[#8B857B] underline hover:text-[#1D1815]"
                >
                  Reset section
                </button>
              )}
            </div>
            <div className="mt-1 max-md:hidden text-[12px] leading-snug text-[#8B857B]">{surface.description}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedComponent && !isCategoriesSurface && (
              <SettingsSearch
                query={settingQuery}
                onQueryChange={(query) => {
                  setSettingQuery(query)
                  setHoveredFieldId(null)
                }}
                inputRef={searchInputRef}
              />
            )}

            {/* Store-wide readability — global surface only */}
            {surface.id === 'global' && !selectedComponent && !settingQuery.trim() && (
              <ContrastSummary
                issues={contrastIssues}
                onFix={(fieldId, color) => setFieldValue(fieldId, color)}
                onFixAll={() => applyValues(Object.fromEntries(contrastIssues.map((issue) => [issue.fieldId, issue.fix])))}
              />
            )}

            {/* Palette presets — global surface only */}
            {surface.id === 'global' && !selectedComponent && !settingQuery.trim() && (
              <div className="border-b border-[#E5E0D6] px-[18px] pb-4 pt-3.5">
                <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">
                  Palette presets
                </div>
                <div className="flex flex-col gap-1.5">
                  {BRANDING_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyValues(preset.values)}
                      className="flex items-center gap-2.5 rounded-[10px] border border-[#E5E0D6] px-3 py-2 text-left text-[12.5px] font-bold transition-colors hover:border-[#1D1815]"
                    >
                      <span className="flex gap-[3px]">
                        {[preset.values.primary_color, preset.values.accent_color, preset.values.text_secondary_color, preset.values.background_color].map(
                          (swatch, i) => (
                            <span
                              key={i}
                              className="h-3.5 w-3.5 rounded border border-black/5"
                              style={{ background: swatch }}
                            />
                          )
                        )}
                      </span>
                      <span className="flex-1">{preset.name}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border border-dashed border-[#D8D2C6] px-3 py-2.5">
                  <label className="relative h-[30px] w-[30px] flex-shrink-0 cursor-pointer overflow-hidden rounded-full border border-neutral-200">
                    <input
                      type="color"
                      value={logoColor}
                      aria-label="Logo color"
                      onChange={(e) => {
                        setLogoColor(e.target.value)
                        applyValues(generatePaletteFromColor(e.target.value))
                      }}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer border-none p-0"
                    />
                  </label>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-bold">Generate from logo color</div>
                    <div className="mt-px text-[11px] text-[#8B857B]">
                      Pick your logo&apos;s main color — we derive a full palette.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Layout — custom category manager panel (no registry fields) */}
            {isCategoriesSurface && (
              <CategoryLayoutPanel
                categories={savedCategories}
                draft={categoryDraft}
                onDraftChange={studio.setCategories}
              />
            )}

            {selectedComponent ? (
              <ComponentPanel
                component={selectedComponent}
                crumbs={componentBreadcrumb(selectedComponent.id)}
                fields={panelSections
                  .flatMap((section) => section.fields)
                  .filter((field) => selectedComponent.fieldIds.includes(field.id) && isFieldShown(field))}
                renderField={renderField}
                onSelectScope={selectScope}
              />
            ) : (
              <>
                {/* Accordion sections — every setting on the screen */}
                {panelSections.map((section, sectionIndex) => {
                  const isSearching = settingQuery.trim().length > 0
                  const isOpen = isSearching || !!openSections[sectionIndex]
                  const columnDraft = isProductSurface ? productDraft : draft
                  const overrideDraft = isProductSurface ? mobileProductDraft : mobileDraft
                  const isSectionDirty = section.fields.some((f) => {
                    if (f.type === 'note') return false
                    // Column-backed fields stay in the tenant-column draft even on mobile.
                    const bag = editsTenantColumn(f, isMobile) ? columnDraft : overrideDraft
                    return Object.prototype.hasOwnProperty.call(bag, f.id)
                  })
                  const visibleFields = section.fields.filter(
                    (f) => isFieldShown(f) && (!isSearching || matchesSettingQuery(f, settingQuery))
                  )
                  if (visibleFields.length === 0) return null
                  return (
                    <div
                      key={section.title}
                      id={getBrandingSectionAnchorId(sectionIndex)}
                      className="border-b border-[#E5E0D6]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSections((prev) => ({ ...prev, [sectionIndex]: !prev[sectionIndex] }))
                        }
                        className="flex w-full items-center gap-2 px-[18px] py-3 text-left text-[13px] font-extrabold hover:bg-black/[0.02]"
                      >
                        <span className="flex-1">{section.title}</span>
                        {isSectionDirty && <span className="h-1.5 w-1.5 rounded-full bg-[#E4572E]" />}
                        <span
                          className="text-[11px] text-neutral-400 transition-transform"
                          style={{ transform: `rotate(${isOpen ? 0 : -90}deg)` }}
                        >
                          ▼
                        </span>
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-3 px-[18px] pb-4 pt-0.5">
                          {visibleFields.map((field) => renderField(field))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
            <div className="h-8" />
          </div>
        </SettingsSheet>

        {/* ============ LIVE PREVIEW ============ */}
        <PreviewFrame
          tenantSlug={tenantSlug}
          surfaceId={surface.id}
          draft={previewDraft}
          productDraft={productDraft}
          categoryDraft={categoryDraft as Record<string, unknown>}
          mobileOverrides={mergeMobileOverrides(savedMobile, mobileDraft)}
          productMobileOverrides={mergeMobileOverrides(savedMobileProduct, mobileProductDraft)}
          device={device}
          sampleItemId={sampleItemId}
          inspectMode={isEditing}
          onScopeSelected={handleScopeSelected}
          onLabelEdited={handleLabelEdited}
          selectedScope={isEditing ? selectedScope : null}
          hoveredFieldId={isEditing ? hoveredFieldId : null}
          previewStates={previewStates}
          sampleCart={
            !CART_SURFACES.has(surface.id) || (isCartEmptyPreview && surface.id === 'cart') ? NO_SAMPLE_DISHES : sampleCartItems
          }
          cartView={cartView}
          phoneInsetClass={previewInsetFor(sheetSize)}
          journey={<JourneyBar surfaceId={surface.id} onPick={pickSurface} />}
          stateControls={
            isProductSurface ? (
              <PreviewStateBar chosen={chosenStates} automatic={automaticStates} onToggle={toggleState} />
            ) : surface.id === 'cart' ? (
              <div className="mx-auto mt-3 flex items-center gap-1.5" role="group" aria-label="Show in preview">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B857B]">Show</span>
                {[false, true].map((isEmpty) => (
                  <button
                    key={String(isEmpty)}
                    type="button"
                    aria-pressed={isCartEmptyPreview === isEmpty}
                    onClick={() => setIsCartEmptyPreview(isEmpty)}
                    className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${
                      isCartEmptyPreview === isEmpty ? 'border-[#2A6FDB] bg-[#2A6FDB] text-white' : 'border-[#D8D2C6] bg-white text-[#5E574C]'
                    }`}
                  >
                    {isEmpty ? 'Empty cart' : 'With items'}
                  </button>
                ))}
                <span aria-hidden="true" className="mx-1 text-[#D8D2C6]">|</span>
                {(['drawer', 'page'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={cartView === view}
                    onClick={() => setCartView(view)}
                    className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${
                      cartView === view ? 'border-[#2A6FDB] bg-[#2A6FDB] text-white' : 'border-[#D8D2C6] bg-white text-[#5E574C]'
                    }`}
                  >
                    {view === 'drawer' ? 'Cart drawer' : 'Cart page'}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </div>
    </div>
  )
}
