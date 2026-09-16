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

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { applyMobileOverrides, mergeMobileOverrides, type OverrideMap } from '@/lib/mobile-overrides'
import { buildStorefrontFontsHref } from '@/lib/storefront-theme'

export const BRANDING_PREVIEW_PARAM = 'brandingPreview'
export const BRANDING_DRAFT_MESSAGE = 'wn-branding-draft'
export const BRANDING_READY_MESSAGE = 'wn-branding-preview-ready'

/** Viewport width (px) below which mobile branding overrides apply. */
const MOBILE_BREAKPOINT_PX = 767

export type BrandingPreviewDraft = Record<string, unknown>

/**
 * True on a mobile-width viewport. SSR-safe: renders desktop-first (false) then
 * corrects on mount, so mobile overrides are a progressive enhancement. Also
 * true inside the Studio's 390px preview iframe, so the mobile preview shows
 * mobile overrides.
 */
const viewportListeners = new Set<() => void>()
let viewportQuery: MediaQueryList | null = null
const desktopSnapshot = () => false
const viewportSnapshot = () => viewportQuery?.matches ?? false
const notifyViewport = () => viewportListeners.forEach(listener => listener())

function subscribeViewport(listener: () => void): () => void {
  viewportListeners.add(listener)
  if (viewportListeners.size === 1 && typeof window.matchMedia === 'function') {
    viewportQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    viewportQuery.addEventListener('change', notifyViewport)
  }
  return () => {
    viewportListeners.delete(listener)
    if (viewportListeners.size === 0) {
      viewportQuery?.removeEventListener('change', notifyViewport)
      viewportQuery = null
    }
  }
}

export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribeViewport, viewportSnapshot, desktopSnapshot)
}

/** Remove editor-only meta keys (double-underscore prefixed) from a draft. */
export function stripPreviewMeta(draft: BrandingPreviewDraft): BrandingPreviewDraft {
  const entries = Object.entries(draft).filter(([key]) => !key.startsWith('__'))
  return Object.fromEntries(entries)
}

const PREVIEW_SESSION_FLAG = 'wn-branding-preview'

function isPreviewModeActive(): boolean {
  if (typeof window === 'undefined') return false
  const hasParam = new URLSearchParams(window.location.search).has(BRANDING_PREVIEW_PARAM)
  // Navigating inside the preview iframe drops the query param, so remember
  // preview mode for the session. Harmless if it lingers: with no editor
  // posting drafts the hook returns null and nothing changes.
  try {
    if (hasParam) {
      window.sessionStorage.setItem(PREVIEW_SESSION_FLAG, '1')
      return true
    }
    return window.sessionStorage.getItem(PREVIEW_SESSION_FLAG) === '1'
  } catch {
    // Storage unavailable (privacy mode) — fall back to the param only.
    return hasParam
  }
}

/**
 * Live draft from the Branding Studio, or null when the page is not running
 * inside the editor's preview iframe. Includes meta keys (e.g.
 * `__previewSurface`) — merge into tenants via useBrandingPreviewTenant().
 */
// Browser-only subscriptions are shared by every preview consumer. No draft
// is set during SSR, and the last unmount releases both the listener and data.
const draftListeners = new Set<() => void>()
let previewDraft: BrandingPreviewDraft | null = null
const emptyDraft = () => null
const draftSnapshot = () => previewDraft
const noSubscription = () => () => {}

function receiveDraft(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return
  const data = event.data as { type?: unknown; draft?: unknown } | null
  if (!data || typeof data !== 'object' || data.type !== BRANDING_DRAFT_MESSAGE) return
  if (!data.draft || typeof data.draft !== 'object' || Array.isArray(data.draft)) return
  previewDraft = data.draft as BrandingPreviewDraft
  draftListeners.forEach(listener => listener())
}

function subscribeDraft(listener: () => void): () => void {
  draftListeners.add(listener)
  if (draftListeners.size === 1) window.addEventListener('message', receiveDraft)
  // Each newly mounted surface asks the editor to re-send its current draft.
  // This preserves the existing route-change handshake without more listeners.
  window.parent?.postMessage({ type: BRANDING_READY_MESSAGE }, window.location.origin)
  return () => {
    draftListeners.delete(listener)
    if (draftListeners.size === 0) {
      window.removeEventListener('message', receiveDraft)
      previewDraft = null
    }
  }
}

export function useBrandingPreviewDraft(): BrandingPreviewDraft | null {
  const [isEnabled] = useState(isPreviewModeActive)
  return useSyncExternalStore(
    isEnabled ? subscribeDraft : noSubscription,
    isEnabled ? draftSnapshot : emptyDraft,
    emptyDraft,
  )
}

/**
 * The mobile override map in effect for the current render: the tenant's saved
 * `mobile_overrides` with the Studio's unpublished mobile draft layered on top
 * (a blanked draft entry removes the key — back to inheriting desktop). Empty
 * on a desktop viewport.
 *
 * Consumers need the map itself, not just the merged tenant, to know WHICH
 * fields have a distinct mobile value — see resolveStorefrontLayout.
 */
export function selectEffectiveMobileOverrides(
  tenant: { mobile_overrides?: unknown } | null | undefined,
  draft: BrandingPreviewDraft | null,
  isMobile: boolean
): OverrideMap {
  if (!isMobile) return {}
  const saved = (tenant?.mobile_overrides as OverrideMap | undefined) ?? {}
  const draftOverrides = draft?.__mobileOverrides as OverrideMap | undefined
  return draftOverrides ? mergeMobileOverrides(saved, draftOverrides) : saved
}

/** Hook form of selectEffectiveMobileOverrides for the storefront pages. */
export function useMobileOverrides(tenant: { mobile_overrides?: unknown } | null | undefined): OverrideMap {
  const draft = useBrandingPreviewDraft()
  const isMobile = useIsMobileViewport()
  return useMemo(
    () => selectEffectiveMobileOverrides(tenant, draft, isMobile),
    [tenant, draft, isMobile]
  )
}

/**
 * The page's tenant object with the live Branding Studio draft merged over
 * its columns. Outside preview mode (or before the first draft arrives) the
 * original reference is returned so there is zero behavioural change.
 */
export function useBrandingPreviewTenant<T extends object | null>(tenant: T): T {
  const draft = useBrandingPreviewDraft()
  const isMobile = useIsMobileViewport()
  // Called from here rather than from each page: every surface that takes part
  // in the preview already calls this hook, so a new one cannot forget and
  // render a drafted pairing in the fallback typeface.
  useStorefrontFontPreview()
  return useMemo(() => {
    if (!tenant) return tenant
    let result = { ...(tenant as Record<string, unknown>) }
    // Real runtime on a phone: overlay the tenant's saved mobile overrides.
    if (isMobile) {
      result = applyMobileOverrides(result, result.mobile_overrides as OverrideMap | undefined)
    }
    if (draft) {
      // Preview draft's desktop columns, then its mobile layer on top.
      result = { ...result, ...stripPreviewMeta(draft) }
      if (isMobile) {
        result = applyMobileOverrides(result, draft.__mobileOverrides as OverrideMap | undefined)
      }
    }
    // Nothing changed the reference-worthy path outside preview/mobile.
    if (!draft && !isMobile) return tenant
    return result as T
  }, [tenant, draft, isMobile])
}

/**
 * Loads every storefront typeface while the Branding Studio preview is open.
 *
 * The storefront's server layout emits a stylesheet for the pairing the tenant
 * has SAVED, because that is all a real customer will ever render with. The
 * Studio's whole job is showing unsaved ones, and a draft arrives after the
 * server response — so inside the preview iframe, and only there, the full set
 * is loaded once so switching pairings is instant.
 *
 * A no-op outside preview mode: a customer never pays for this.
 */
export function useStorefrontFontPreview(): void {
  const [isEnabled] = useState(isPreviewModeActive)

  useEffect(() => {
    if (!isEnabled || typeof document === 'undefined') return

    const href = buildStorefrontFontsHref()
    if (document.querySelector(`link[href="${href}"]`)) return

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.brandingPreviewFonts = 'true'
    document.head.appendChild(link)

    return () => {
      link.remove()
    }
  }, [isEnabled])
}
