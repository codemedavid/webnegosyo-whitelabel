'use client'

/**
 * Branding Studio preview bridge — storefront side.
 *
 * The Branding Studio (/[tenant]/admin/branding) renders the real storefront
 * pages inside a same-origin iframe with ?brandingPreview=1 and streams the
 * unsaved draft via postMessage. Pages opt in by passing their tenant object
 * through useBrandingPreviewTenant(); the draft's tenant columns are merged
 * over the saved ones so every branding consumer re-renders instantly.
 *
 * Nothing here persists or exposes data: drafts only restyle the viewer's own
 * client-side render, and messages are accepted from the page's origin only.
 */

import { useEffect, useMemo, useState } from 'react'

export const BRANDING_PREVIEW_PARAM = 'brandingPreview'
export const BRANDING_DRAFT_MESSAGE = 'wn-branding-draft'
export const BRANDING_READY_MESSAGE = 'wn-branding-preview-ready'

export type BrandingPreviewDraft = Record<string, unknown>

/** Remove editor-only meta keys (double-underscore prefixed) from a draft. */
export function stripPreviewMeta(draft: BrandingPreviewDraft): BrandingPreviewDraft {
  const entries = Object.entries(draft).filter(([key]) => !key.startsWith('__'))
  return Object.fromEntries(entries)
}

function isPreviewModeActive(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has(BRANDING_PREVIEW_PARAM)
}

/**
 * Live draft from the Branding Studio, or null when the page is not running
 * inside the editor's preview iframe. Includes meta keys (e.g.
 * `__previewSurface`) — merge into tenants via useBrandingPreviewTenant().
 */
export function useBrandingPreviewDraft(): BrandingPreviewDraft | null {
  const [isEnabled] = useState(isPreviewModeActive)
  const [draft, setDraft] = useState<BrandingPreviewDraft | null>(null)

  useEffect(() => {
    if (!isEnabled) return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown; draft?: unknown } | null
      if (!data || typeof data !== 'object' || data.type !== BRANDING_DRAFT_MESSAGE) return
      if (!data.draft || typeof data.draft !== 'object' || Array.isArray(data.draft)) return
      setDraft(data.draft as BrandingPreviewDraft)
    }

    window.addEventListener('message', handleMessage)
    // Tell the editor we can receive drafts (it re-sends the current draft on
    // every ready signal, so route changes inside the iframe stay in sync).
    try {
      window.parent?.postMessage({ type: BRANDING_READY_MESSAGE }, window.location.origin)
    } catch {
      // Cross-origin parent (not the editor) — nothing to announce.
    }
    return () => window.removeEventListener('message', handleMessage)
  }, [isEnabled])

  return isEnabled ? draft : null
}

/**
 * The page's tenant object with the live Branding Studio draft merged over
 * its columns. Outside preview mode (or before the first draft arrives) the
 * original reference is returned so there is zero behavioural change.
 */
export function useBrandingPreviewTenant<T extends Record<string, unknown> | null>(tenant: T): T {
  const draft = useBrandingPreviewDraft()
  return useMemo(() => {
    if (!draft || !tenant) return tenant
    return { ...tenant, ...stripPreviewMeta(draft) } as T
  }, [tenant, draft])
}
