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
  type BrandingSurface,
} from '@/lib/branding-registry'
import { getTenantBranding } from '@/lib/branding-utils'
import { saveBrandingAction } from '@/app/actions/branding'
import { withPackSettingsPreview } from '@/lib/storefront-pack-studio'
import type { BrandingInput } from '@/lib/branding-service'
import {
  PRODUCT_DETAIL_SECTIONS,
  getProductDetailFieldIds,
  createProductFieldResolver,
  isProductFieldSet,
} from '@/lib/product-detail-registry'
import { saveProductDetailSettings } from '@/app/actions/product-detail-settings'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import {
  applyMobileOverrides,
  mergeMobileOverrides,
  resolveMobileFieldValue,
} from '@/lib/mobile-overrides'
import {
  resolveBrandingScope,
  getScopeSectionIndex,
  getBrandingSectionAnchorId,
  getBrandingFieldAnchorId,
} from '@/lib/branding-inspect'
import {
  hasCategoryDraftChanges,
} from '@/lib/category-studio'
import { reorderCategoriesAction, updateCategoryAction } from '@/app/actions/categories'
import { publishStudio } from '@/lib/branding-studio/publish-studio'
import { FieldRow } from './field-row'
import { ChangesMenu, HistoryButtons, RestoreBanner } from './changes-menu'
import { useStudioDrafts } from './use-studio-drafts'
import { PreviewFrame } from './preview-frame'
import { CategoryLayoutPanel } from './category-layout-panel'
import type { GalleryContext } from './template-gallery'
import type { Category, MenuItem, Tenant } from '@/types/database'

const PUBLISHED_TOAST_MS = 2500
/** How long a section header pulses after a click-to-inspect jump. */
const SECTION_FLASH_MS = 1600
/** Wait for the accordion to open before scrolling the section into view. */
const SECTION_SCROLL_DELAY_MS = 60

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

export function BrandingStudio({ tenant, tenantSlug, sampleItemId, productSettings, products = [], categories = [], sampleMenuItem, initialSurfaceId }: BrandingStudioProps) {
  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products]
  )
  const router = useRouter()
  const [surfaceId, setSurfaceId] = useState<BrandingSurface['id']>(initialSurfaceId ?? 'storefront')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
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
  // Click-to-inspect: while on, the preview highlights hovered regions and a
  // click jumps the panel to that region's settings section.
  const [isInspecting, setIsInspecting] = useState(false)
  const [flashSectionIndex, setFlashSectionIndex] = useState<number | null>(null)
  const [flashFieldId, setFlashFieldId] = useState<string | null>(null)

  const isMobile = device === 'mobile'

  // The preview's tenant merge is a shallow spread, so pack setting edits
  // must reach it as the whole folded storefront_pack_settings object.
  const previewDraft = useMemo(() => withPackSettingsPreview(draft, savedTenant), [draft, savedTenant])

  // Product Detail rows resolve through the product page's own merge, against
  // the desktop brand the merchant is editing right now.
  const desktopBranding = useMemo(() => getTenantBranding({ ...savedTenant, ...draft }), [savedTenant, draft])
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

  // ⌘Z / ⇧⌘Z (Ctrl on Windows). Text boxes keep their own typing undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable === true
        || (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'color')
      if (isTyping) return
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
  }, [])

  // A region was clicked in the preview: jump to its surface, open exactly
  // its section, pulse it, and drop back out of inspect mode (single-shot,
  // DevTools-style).
  const handleScopeSelected = useCallback((scope: string) => {
    const target = resolveBrandingScope(scope)
    if (!target) {
      toast.error('No settings are mapped to that element yet')
      return
    }
    const sectionIndex = getScopeSectionIndex(target)
    setSurfaceId(target.surfaceId)
    setOpenSections(sectionIndex >= 0 ? { [sectionIndex]: true } : { 0: true })
    setIsInspecting(false)
    if (sectionIndex < 0) return
    // Field-level scopes pulse the exact row; section scopes pulse the header.
    if (target.fieldId) {
      setFlashFieldId(target.fieldId)
      window.setTimeout(() => setFlashFieldId(null), SECTION_FLASH_MS)
    } else {
      setFlashSectionIndex(sectionIndex)
      window.setTimeout(() => setFlashSectionIndex(null), SECTION_FLASH_MS)
    }
    window.setTimeout(() => {
      const anchorId = target.fieldId
        ? getBrandingFieldAnchorId(target.fieldId)
        : getBrandingSectionAnchorId(sectionIndex)
      document
        .getElementById(anchorId)
        ?.scrollIntoView({ behavior: 'smooth', block: target.fieldId ? 'center' : 'start' })
    }, SECTION_SCROLL_DELAY_MS)
  }, [])

  const applyValues = useCallback((values: Record<string, string>) => studio.applyValues('tenant', values), [studio])

  const resetSurface = useCallback(() => {
    if (isCategoriesSurface) {
      studio.setCategories({})
      return
    }
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
      : getSurfaceFieldIds(surface.id).some((id) => isFieldSet(id, draft, savedTenant))

  const [logoColor, setLogoColor] = useState('#E4572E')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#EFECE6] font-sans text-[#1D1815]">
      {/* ============ TOP BAR ============ */}
      <div className="z-20 flex h-[54px] flex-shrink-0 items-center gap-4 border-b border-[#E5E0D6] bg-white px-4">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/${tenantSlug}/admin`}
            className="flex h-[26px] items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Back to admin"
          >
            ← Admin
          </Link>
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#1D1815] text-[13px] font-black text-white">
            W
          </div>
          <div className="text-[14px] font-extrabold">Branding Studio</div>
          <div className="border-l border-[#E5E0D6] pl-3 text-[12px] font-semibold text-[#8B857B]">
            {tenant.name}
          </div>
        </div>

        <div className="flex-1" />

        <HistoryButtons canUndo={studio.canUndo} canRedo={studio.canRedo} onUndo={undo} onRedo={redo} />

        {/* click-to-inspect toggle */}
        <button
          type="button"
          onClick={() => setIsInspecting((prev) => !prev)}
          aria-pressed={isInspecting}
          title="Hover the preview and click any element to open its settings"
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
            isInspecting
              ? 'bg-[#2A6FDB] text-white'
              : 'bg-[#EFECE6] text-[#8B857B] hover:text-[#1D1815]'
          }`}
        >
          <span aria-hidden="true">⌖</span>
          {isInspecting ? 'Click an element…' : 'Inspect'}
        </button>

        {/* device toggle */}
        <div className="flex gap-0.5 rounded-full bg-[#EFECE6] p-[3px]">
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
          className="rounded-full bg-[#1D1815] px-5 py-2 text-[13px] font-extrabold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
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

      <div className="flex min-h-0 flex-1">
        {/* ============ ICON RAIL ============ */}
        <nav className="flex w-[84px] flex-shrink-0 flex-col items-center gap-1 overflow-y-auto bg-[#1D1815] px-2 py-3">
          {BRANDING_SURFACES.map((s) => {
            const isActive = s.id === surface.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSurface(s.id)}
                className={`flex w-[68px] flex-col items-center gap-1.5 rounded-[10px] px-0.5 pb-2 pt-2 transition-colors hover:bg-white/15 ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/60'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px] font-black ${
                    isActive ? 'bg-amber-500 text-[#1D1815]' : 'bg-white/10 text-white/70'
                  }`}
                >
                  {s.glyph}
                </span>
                <span className="text-center text-[9.5px] font-bold leading-[1.15] tracking-wide">
                  {s.label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* ============ SETTINGS PANEL ============ */}
        <aside className="flex w-[336px] flex-shrink-0 flex-col border-r border-[#E5E0D6] bg-white">
          <div className="border-b border-[#E5E0D6] px-[18px] pb-3 pt-4">
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
            <div className="mt-1 text-[12px] leading-snug text-[#8B857B]">{surface.description}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Palette presets — global surface only */}
            {surface.id === 'global' && (
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

            {/* Accordion sections */}
            {(isProductSurface ? PRODUCT_DETAIL_SECTIONS : surface.sections).map((section, sectionIndex) => {
              const isOpen = !!openSections[sectionIndex]
              const columnDraft = isProductSurface ? productDraft : draft
              const overrideDraft = isProductSurface ? mobileProductDraft : mobileDraft
              const isSectionDirty = section.fields.some((f) => {
                if (f.type === 'note') return false
                // Column-backed fields stay in the tenant-column draft even on mobile.
                const bag = editsTenantColumn(f, isMobile) ? columnDraft : overrideDraft
                return Object.prototype.hasOwnProperty.call(bag, f.id)
              })
              const visibleFields = section.fields.filter((f) =>
                (!f.mobileOnly || device === 'mobile') &&
                (isProductSurface || isFieldVisible(f, resolveEditorValue))
              )
              if (visibleFields.length === 0) return null
              const isFlashing = flashSectionIndex === sectionIndex
              return (
                <div
                  key={section.title}
                  id={getBrandingSectionAnchorId(sectionIndex)}
                  className={`border-b border-[#E5E0D6] transition-colors duration-500 ${
                    isFlashing ? 'bg-amber-100' : ''
                  }`}
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
                      {visibleFields.map((field) => {
                        // Desktop-resolved value first — mobile rows fall back
                        // to it when they have no override of their own.
                        const productField = isProductSurface
                          ? productFields.effective(field.id)
                          : null
                        const desktopValue = productField
                          ? productField.value
                          : resolveFieldValue(field.id, draft, savedTenant)
                        const desktopIsSet = productField
                          ? productField.isSet
                          : isFieldSet(field.id, draft, savedTenant)
                        const desktopInherit = productField
                          ? productField.inheritLabel
                          : getInheritSourceLabel(field.id, draft, savedTenant)

                        const activeMobileDraft = isProductSurface ? mobileProductDraft : mobileDraft
                        const activeSavedMobile = isProductSurface ? savedMobileProduct : savedMobile

                        // Column-backed fields (e.g. mobile_grid_columns) always
                        // edit their real tenant column, even on the mobile tab —
                        // the storefront reads that column directly.
                        const usesMobilePath = !editsTenantColumn(field, isMobile)

                        return (
                          <div
                            key={field.id}
                            id={getBrandingFieldAnchorId(field.id)}
                            className={`rounded-md transition-colors duration-500 ${
                              flashFieldId === field.id ? 'bg-amber-100' : ''
                            }`}
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
                            onChange={(value) =>
                              usesMobilePath
                                ? (isProductSurface ? setMobileProductFieldValue : setMobileFieldValue)(field.id, value)
                                : (isProductSurface ? setProductFieldValue : setFieldValue)(field.id, value)
                            }
                            onClear={() =>
                              usesMobilePath
                                ? (isProductSurface ? clearMobileProductFieldValue : clearMobileFieldValue)(field.id)
                                : (isProductSurface ? clearProductFieldValue : clearFieldValue)(field.id)
                            }
                            contrastIssue={
                              productField && !usesMobilePath
                                ? productFields.contrastIssue(field.id)
                                : null
                            }
                          />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="h-8" />
          </div>
        </aside>

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
          inspectMode={isInspecting}
          onScopeSelected={handleScopeSelected}
        />
      </div>
    </div>
  )
}
