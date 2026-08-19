'use client'

/**
 * Branding Studio live preview — renders the REAL storefront route for the
 * active surface in a same-origin iframe and streams the unsaved draft to it
 * via postMessage (received by useBrandingPreviewTenant on the storefront
 * side). Because it is the actual page, the preview is pixel-exact and the
 * mobile toggle exercises real responsive breakpoints.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  BRANDING_DRAFT_MESSAGE,
  BRANDING_PREVIEW_PARAM,
  BRANDING_READY_MESSAGE,
  type BrandingPreviewDraft,
} from '@/hooks/use-branding-preview'
import {
  BRANDING_INSPECT_MODE_MESSAGE,
  BRANDING_SCOPE_SELECTED_MESSAGE,
} from '@/lib/branding-inspect'
import { getPreviewTarget } from './preview-routes'
import type { BrandingSurface } from '@/lib/branding-registry'

const DRAFT_POST_DEBOUNCE_MS = 60
const MOBILE_PREVIEW_WIDTH_PX = 390

interface PreviewFrameProps {
  tenantSlug: string
  surfaceId: BrandingSurface['id']
  draft: BrandingPreviewDraft
  /** Product-detail store draft — streamed under __productDetailDraft. */
  productDraft?: BrandingPreviewDraft
  /** Menu Layout surface category draft — streamed under __categoryDraft. */
  categoryDraft?: BrandingPreviewDraft
  /** Merged tenant mobile overrides — applied on a mobile viewport. */
  mobileOverrides?: BrandingPreviewDraft
  /** Merged product-detail mobile overrides — applied on a mobile viewport. */
  productMobileOverrides?: BrandingPreviewDraft
  device: 'desktop' | 'mobile'
  /** A real menu item id so the product surface can preview the item page. */
  sampleItemId?: string | null
  /** While true the framed storefront highlights hovered branded regions. */
  inspectMode?: boolean
  /** Called with the scope key when a highlighted region is clicked. */
  onScopeSelected?: (scope: string) => void
}

export function PreviewFrame({
  tenantSlug,
  surfaceId,
  draft,
  productDraft,
  categoryDraft,
  mobileOverrides,
  productMobileOverrides,
  device,
  sampleItemId,
  inspectMode = false,
  onScopeSelected,
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const draftRef = useRef(draft)
  const productDraftRef = useRef(productDraft)
  const categoryDraftRef = useRef(categoryDraft)
  const mobileOverridesRef = useRef(mobileOverrides)
  const productMobileOverridesRef = useRef(productMobileOverrides)
  const surfaceRef = useRef(surfaceId)
  const inspectModeRef = useRef(inspectMode)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const previewPath = useMemo(() => {
    const { path } = getPreviewTarget(tenantSlug, surfaceId, sampleItemId)
    return `${path}?${BRANDING_PREVIEW_PARAM}=1`
  }, [tenantSlug, surfaceId, sampleItemId])

  const postDraft = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.postMessage(
      {
        type: BRANDING_DRAFT_MESSAGE,
        draft: {
          ...draftRef.current,
          __previewSurface: surfaceRef.current,
          __productDetailDraft: productDraftRef.current ?? {},
          __categoryDraft: categoryDraftRef.current ?? {},
          __mobileOverrides: mobileOverridesRef.current ?? {},
          __productMobileOverrides: productMobileOverridesRef.current ?? {},
        },
      },
      window.location.origin
    )
    // Ride inspect mode on every draft send so a freshly (re)loaded or
    // navigated iframe always knows the current mode.
    frameWindow.postMessage(
      { type: BRANDING_INSPECT_MODE_MESSAGE, enabled: inspectModeRef.current },
      window.location.origin
    )
  }, [])

  // Stream draft changes (debounced — color pickers fire on every drag tick).
  useEffect(() => {
    draftRef.current = draft
    productDraftRef.current = productDraft
    categoryDraftRef.current = categoryDraft
    mobileOverridesRef.current = mobileOverrides
    productMobileOverridesRef.current = productMobileOverrides
    surfaceRef.current = surfaceId
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(postDraft, DRAFT_POST_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draft, productDraft, categoryDraft, mobileOverrides, productMobileOverrides, surfaceId, postDraft])

  // Push inspect-mode changes immediately (no debounce — it's a UI toggle).
  useEffect(() => {
    inspectModeRef.current = inspectMode
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.postMessage(
      { type: BRANDING_INSPECT_MODE_MESSAGE, enabled: inspectMode },
      window.location.origin
    )
  }, [inspectMode])

  // Re-send the current draft whenever the framed page announces readiness
  // (initial load and any in-iframe navigation), and surface click-to-inspect
  // selections coming back from the framed storefront.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown; scope?: unknown } | null
      if (!data || typeof data !== 'object') return
      if (data.type === BRANDING_READY_MESSAGE) {
        postDraft()
        return
      }
      if (data.type === BRANDING_SCOPE_SELECTED_MESSAGE && typeof data.scope === 'string') {
        onScopeSelected?.(data.scope)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [postDraft, onScopeSelected])

  const isMobile = device === 'mobile'

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-auto p-6 [background-image:radial-gradient(circle,rgba(0,0,0,0.07)_1px,transparent_1px)] [background-size:18px_18px]">
      <div
        className={`mx-auto flex min-h-0 flex-1 flex-col overflow-hidden bg-white shadow-[0_18px_50px_rgba(30,22,12,0.18)] ${
          isMobile
            ? 'w-[390px] max-w-full rounded-[30px] border-8 border-[#23201B]'
            : 'w-full rounded-xl border border-black/10'
        }`}
        style={isMobile ? { width: MOBILE_PREVIEW_WIDTH_PX } : undefined}
      >
        <iframe
          ref={iframeRef}
          key={previewPath}
          src={previewPath}
          title="Storefront live preview"
          onLoad={postDraft}
          className="h-full w-full flex-1 border-0"
        />
      </div>
      <div className="mt-3 text-center text-[11.5px] font-bold text-[rgba(80,72,60,0.75)]">
        {isMobile
          ? 'Mobile preview · 390px — real responsive breakpoints'
          : 'Live preview · changes apply instantly, nothing is saved until you publish'}
      </div>
    </div>
  )
}
