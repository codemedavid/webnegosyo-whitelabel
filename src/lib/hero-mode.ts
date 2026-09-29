/**
 * Hero rendering decision — shared by the storefront so a merchant's choice in
 * the Branding Studio's hero Style dropdown is honoured consistently.
 *
 * The dropdown offers the built-in presets (centered, editorial, split, …) plus
 * two special values:
 *   - 'theme'  → the default; resolves to a preset look.
 *   - 'custom' → render the layout built in the Hero Builder (tenant.hero_design).
 *
 * A custom hero renders ONLY when 'custom' is chosen explicitly (publishing
 * from the Hero Builder sets it). `hero_design` is a TEXT column — the API
 * returns a JSON string — so it is always parsed here, never read as an object.
 */

import { resolveHeroPreset } from '@/lib/storefront-theme'
import { loadHeroDesign, parseStoredDesign } from '@/lib/hero-builder/load'

export interface HeroModeInput {
  hero_preset?: string | null
  hero_design?: unknown
  hero_section_enabled?: boolean | null
}

/** True when `value` names one of the built-in rich presets (not theme/custom). */
export function isConcreteHeroPreset(value: unknown): boolean {
  return resolveHeroPreset(value) !== null
}

export type CustomHeroKind = 'block' | 'legacy'

/**
 * Which custom renderer the stored design needs: 'block' (v4/v5 Hero
 * Builder), 'legacy' (v3 absolute layout), or null when there is nothing to
 * render.
 */
function storedDesignKind(raw: unknown): CustomHeroKind | null {
  const parsed = parseStoredDesign(raw)
  if (!parsed) return null
  if (parsed.version === 4 || parsed.version === 5) {
    const design = loadHeroDesign(parsed)
    return design && design.sections.length > 0 ? 'block' : null
  }
  return Object.keys(parsed).length > 0 ? 'legacy' : null
}

/**
 * True when the storefront hero should render the merchant's custom design
 * (tenant.hero_design) instead of a preset.
 */
export function shouldUseCustomHero(tenant: HeroModeInput | null | undefined): boolean {
  if (!tenant || tenant.hero_preset !== 'custom') return false
  return storedDesignKind(tenant.hero_design) !== null
}

/** The custom renderer to use, or null (hero disabled / no custom design). */
export function customHeroKind(tenant: HeroModeInput | null | undefined): CustomHeroKind | null {
  if (!tenant || tenant.hero_section_enabled === false || tenant.hero_preset !== 'custom') return null
  return storedDesignKind(tenant.hero_design)
}

export interface HeroBandInput extends HeroModeInput {
  hero_background_color?: string | null
}

/**
 * True when the storefront hero renders as a full-bleed colored band (a preset
 * hero with a background color). The band sits flush under the header, so the
 * storefront drops <main>'s top padding for it. `banner` is excluded — it is a
 * self-contained rounded card, never a band.
 */
export function isFullBleedHeroBand(tenant: HeroBandInput | null | undefined): boolean {
  if (!tenant || tenant.hero_section_enabled === false) return false
  if (shouldUseCustomHero(tenant)) return false
  const preset = resolveHeroPreset(tenant.hero_preset)
  if (!preset || preset === 'banner') return false
  return !!tenant.hero_background_color
}
