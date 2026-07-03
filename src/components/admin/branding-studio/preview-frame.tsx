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
import type { BrandingSurface } from '@/lib/branding-registry'

const DRAFT_POST_DEBOUNCE_MS = 60
const MOBILE_PREVIEW_WIDTH_PX = 390

/** Storefront route previewed for each editor surface. */
export function getPreviewPath(tenantSlug: string, surfaceId: BrandingSurface['id']): string {
  const base = `/${tenantSlug}`
  switch (surfaceId) {
    case 'cart':
      return `${base}/cart`
    case 'checkout':
    case 'upsell':
      return `${base}/checkout`
    default:
      // global / storefront / product / footer / flash all live on the menu page
      return `${base}/menu`
  }
}

interface PreviewFrameProps {
  tenantSlug: string
  surfaceId: BrandingSurface['id']
  draft: BrandingPreviewDraft
  device: 'desktop' | 'mobile'
}

export function PreviewFrame({ tenantSlug, surfaceId, draft, device }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const draftRef = useRef(draft)
  const surfaceRef = useRef(surfaceId)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const previewPath = useMemo(
    () => `${getPreviewPath(tenantSlug, surfaceId)}?${BRANDING_PREVIEW_PARAM}=1`,
    [tenantSlug, surfaceId]
  )

  const postDraft = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.postMessage(
      {
        type: BRANDING_DRAFT_MESSAGE,
        draft: { ...draftRef.current, __previewSurface: surfaceRef.current },
      },
      window.location.origin
    )
  }, [])

  // Stream draft changes (debounced — color pickers fire on every drag tick).
  useEffect(() => {
    draftRef.current = draft
    surfaceRef.current = surfaceId
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(postDraft, DRAFT_POST_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draft, surfaceId, postDraft])

  // Re-send the current draft whenever the framed page announces readiness
  // (initial load and any in-iframe navigation).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown } | null
      if (data && typeof data === 'object' && data.type === BRANDING_READY_MESSAGE) {
        postDraft()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [postDraft])

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
