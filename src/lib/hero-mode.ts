/**
 * Hero rendering decision — shared by the storefront so a merchant's choice in
 * the Branding Studio's hero Style dropdown is honoured consistently.
 *
 * The dropdown offers the built-in presets (centered, editorial, split, …) plus
 * two special values:
 *   - 'theme'  → the default; resolves to a preset look.
 *   - 'custom' → render the layout built in the Hero Designer (tenant.hero_design).
 *
 * `shouldUseCustomHero` decides between the custom design and a preset:
 *   - Explicit 'custom' + a saved design      → custom.
 *   - A concrete preset chosen                → preset (the template wins even
 *                                               if an old design still exists).
 *   - Legacy: a saved design with the default → custom (so heroes built before
 *     ('theme'/blank) preset                    this feature keep rendering).
 */

import { resolveHeroPreset } from '@/lib/storefront-theme'

export interface HeroModeInput {
  hero_preset?: string | null
  hero_design?: Record<string, unknown> | null
}

/** True when `value` names one of the built-in rich presets (not theme/custom). */
export function isConcreteHeroPreset(value: unknown): boolean {
  return resolveHeroPreset(value) !== null
}

function hasHeroDesign(design: HeroModeInput['hero_design']): boolean {
  return !!design && typeof design === 'object' && Object.keys(design).length > 0
}

/**
 * True when the storefront hero should render the custom Hero Designer layout
 * (tenant.hero_design) instead of a preset.
 */
export function shouldUseCustomHero(tenant: HeroModeInput | null | undefined): boolean {
  if (!tenant) return false
  if (!hasHeroDesign(tenant.hero_design)) return false
  if (tenant.hero_preset === 'custom') return true
  // An explicitly chosen preset beats a lingering saved design.
  if (isConcreteHeroPreset(tenant.hero_preset)) return false
  // Legacy: design saved while the preset stayed at its 'theme'/blank default.
  return true
}
