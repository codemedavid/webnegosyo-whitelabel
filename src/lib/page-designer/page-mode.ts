// Whether a page renders the owner's published design, and which. Pure, so
// the server render and the client agree. Opt-in on both columns, exactly
// like the welcome page: `<page>_design_enabled` AND a stored design with
// something in it. Columns are TEXT — always read through loadHeroDesign.

import { loadHeroDesign } from '@/lib/hero-builder/load'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { preparePageDesign } from './rules'
import type { PageId } from './types'

export const PAGE_DESIGN_COLUMNS: Readonly<Record<PageId, { design: string; enabled: string }>> = {
  tracking: { design: 'tracking_design', enabled: 'tracking_design_enabled' },
  confirmation: { design: 'confirmation_design', enabled: 'confirmation_design_enabled' },
  checkout: { design: 'checkout_design', enabled: 'checkout_design_enabled' },
}

type TenantLike = Readonly<Record<string, unknown>> | null | undefined

/** The stored design (published or not), for the editor. */
export function storedPageDesign(tenant: TenantLike, page: PageId): HeroDesignV5 | null {
  const design = loadHeroDesign(tenant?.[PAGE_DESIGN_COLUMNS[page].design])
  return design && design.sections.length ? design : null
}

/** The published design, made safe for `page`, or null for the standard page. */
export function resolvePageDesign(tenant: TenantLike, page: PageId): HeroDesignV5 | null {
  if (tenant?.[PAGE_DESIGN_COLUMNS[page].enabled] !== true) return null
  const design = storedPageDesign(tenant, page)
  return design ? preparePageDesign(design, page) : null
}

export function hasPageDesign(tenant: TenantLike, page: PageId): boolean {
  return resolvePageDesign(tenant, page) !== null
}

// ── Thank-you → tracking hand-off ───────────────────────────────────────────

export type ConfirmationRedirect = 'instant' | 'countdown' | 'stay'

export const REDIRECT_SECONDS = { min: 3, max: 60, fallback: 5 } as const

export interface ConfirmationRedirectSetting {
  mode: ConfirmationRedirect
  seconds: number
}

/**
 * How the thank-you page hands over to tracking once the order is saved:
 * `instant` (today: straight to tracking), `countdown` (thank-you page, then
 * tracking after N seconds), `stay` (thank-you page until the customer taps
 * Track order). Unknown/missing values read as `instant`.
 */
export function readConfirmationRedirect(tenant: TenantLike): ConfirmationRedirectSetting {
  const raw = tenant?.confirmation_redirect
  const mode: ConfirmationRedirect = raw === 'countdown' || raw === 'stay' ? raw : 'instant'
  const n = Number(tenant?.confirmation_redirect_seconds)
  const seconds = Number.isInteger(n) && n >= REDIRECT_SECONDS.min && n <= REDIRECT_SECONDS.max ? n : REDIRECT_SECONDS.fallback
  return { mode, seconds }
}
