'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useBrandingPreviewDraft } from '@/hooks/use-branding-preview'
import { isSeniorModeRoute, resolveSeniorModeEnabled, SENIOR_MODE_ROOT_FONT_SCALE } from '@/lib/senior-mode'

const SeniorModeContext = createContext(false)

/**
 * Root scale plus the larger add-to-cart toast. Rendered (and SSR'd) only
 * while the mode is active, so the first paint is already the right size and
 * leaving for /admin removes it.
 */
const SENIOR_MODE_CSS = [
  `html{font-size:${SENIOR_MODE_ROOT_FONT_SCALE}}`,
  // !important throughout: sonner's own theme styles the toast, title and
  // description with higher specificity, and its muted grey is too faint.
  '.senior-toast{padding:12px 16px!important;gap:12px!important;border:2px solid #16a34a!important;background:#f0fdf4!important;border-radius:16px!important;align-items:center!important}',
  '.senior-toast [data-title]{font-size:1.1rem!important;font-weight:700!important;line-height:1.3;color:#14532d!important}',
  '.senior-toast [data-description]{font-size:1rem!important;font-weight:500;line-height:1.35;color:#1f2937!important;opacity:1!important}',
  '.senior-toast [data-icon]{color:#16a34a!important;width:28px!important;height:28px!important;margin:0!important;flex-shrink:0}',
  '.senior-toast [data-icon] svg{width:28px!important;height:28px!important}',
  // The cart and checkout designs' own headers carry an unlabelled back arrow;
  // SeniorOrderSteps replaces them with a labelled one, so two never show.
  '[data-senior-hidden]{display:none!important}',
].join('')

interface SeniorModeProviderProps {
  /** The tenant's saved `senior_friendly_mode`. */
  isSavedOn: boolean | null | undefined
  children: ReactNode
}

/**
 * Mounted once in the tenant layout. Customer routes read `useSeniorMode()`;
 * merchant routes under the same layout (/admin, /login) always read false.
 */
export function SeniorModeProvider({ isSavedOn, children }: SeniorModeProviderProps) {
  const pathname = usePathname()
  const draft = useBrandingPreviewDraft()
  const isActive = resolveSeniorModeEnabled(isSavedOn, draft) && isSeniorModeRoute(pathname)

  return (
    <SeniorModeContext.Provider value={isActive}>
      {isActive && <style>{SENIOR_MODE_CSS}</style>}
      {children}
    </SeniorModeContext.Provider>
  )
}

/** True while the storefront should render its senior-friendly variants. */
export function useSeniorMode(): boolean {
  return useContext(SeniorModeContext)
}
