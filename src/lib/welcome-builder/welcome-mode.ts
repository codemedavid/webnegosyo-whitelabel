/**
 * Whether the storefront shows the merchant's Welcome Builder page, and which
 * design. Pure, so the server render and the client overlay agree.
 *
 * Opt-in on both columns: `welcome_design_enabled` (set by publishing, cleared
 * by "Remove from storefront") AND a stored design with something in it. Every
 * row predating the columns reads as off and keeps the classic welcome screen.
 * `welcome_design` is TEXT like `hero_design`, so it always goes through
 * `loadHeroDesign` — never read `.version` off the raw value.
 */

import { loadHeroDesign } from '@/lib/hero-builder/load'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'

import { withGuaranteedEntry } from './entry'

export interface WelcomeDesignFields {
  welcome_design?: unknown
  welcome_design_enabled?: boolean | null
}

/** The published welcome design (with a guaranteed way in), or null for the classic screen. */
export function resolveCustomWelcomeDesign(tenant: WelcomeDesignFields | null | undefined): HeroDesignV5 | null {
  if (tenant?.welcome_design_enabled !== true) return null
  const design = loadHeroDesign(tenant.welcome_design)
  if (!design || design.sections.length === 0) return null
  return withGuaranteedEntry(design)
}

export function hasCustomWelcome(tenant: WelcomeDesignFields | null | undefined): boolean {
  return resolveCustomWelcomeDesign(tenant) !== null
}
