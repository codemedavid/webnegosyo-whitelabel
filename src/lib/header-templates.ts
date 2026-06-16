/**
 * Header Template System
 * Provides different design templates for the customer menu's main (sticky) header.
 * All templates respect tenant branding colors and a shared, per-tenant configuration
 * of toggles (show logo / name / cart / search, tagline, logo shape, height, etc.).
 *
 * Mirrors the architecture of the card-template system (`src/lib/card-templates.ts`).
 */

export type HeaderTemplate =
  | 'classic'   // Logo + name on the left, cart on the right (the original design)
  | 'centered'  // Logo + name centered, cart floats to the right
  | 'minimal'   // Slim, compact bar with small logo + name
  | 'split'     // Logo + name left, search in the center, cart right
  | 'banner'    // Tall hero-style header with a brand gradient and large logo + name
  | 'stacked'   // Logo on top, name beneath it (centered), cart top-right

export interface HeaderTemplateDefinition {
  id: HeaderTemplate
  name: string
  description: string
  preview: string // Emoji representation
  features: string[]
}

/**
 * Available header templates with their metadata.
 */
export const HEADER_TEMPLATES: HeaderTemplateDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Logo and name on the left, cart on the right',
    preview: '🏷️',
    features: ['Logo left', 'Name beside logo', 'Cart on the right', 'Sticky bar'],
  },
  {
    id: 'centered',
    name: 'Centered',
    description: 'Logo and name centered, cart floats to the side',
    preview: '🎯',
    features: ['Centered brand', 'Floating cart', 'Balanced look', 'Great with a tagline'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'A slim, understated bar that saves vertical space',
    preview: '▫️',
    features: ['Slim height', 'Small logo', 'Quiet styling', 'Maximizes menu space'],
  },
  {
    id: 'split',
    name: 'Split',
    description: 'Brand on the left, search in the middle, cart on the right',
    preview: '↔️',
    features: ['Inline search', 'Three-zone layout', 'Cart on the right', 'Discovery-focused'],
  },
  {
    id: 'banner',
    name: 'Banner',
    description: 'A tall, hero-style header with a brand gradient',
    preview: '🖼️',
    features: ['Tall hero band', 'Brand gradient', 'Large centered logo', 'Bold first impression'],
  },
  {
    id: 'stacked',
    name: 'Stacked',
    description: 'Logo stacked above the name, centered like a mobile app',
    preview: '📚',
    features: ['Logo on top', 'Name underneath', 'App-style', 'Cart top-right'],
  },
]

/**
 * Get a header template definition by ID (falls back to the first template).
 */
export function getHeaderTemplateById(id: HeaderTemplate): HeaderTemplateDefinition {
  return HEADER_TEMPLATES.find((t) => t.id === id) || HEADER_TEMPLATES[0]
}

/**
 * Default header template.
 */
export const DEFAULT_HEADER_TEMPLATE: HeaderTemplate = 'classic'

export type HeaderLogoShape = 'circle' | 'rounded' | 'square'
export type HeaderHeight = 'compact' | 'standard' | 'tall'

/**
 * Resolved, render-ready configuration for the main header.
 * These are the editable "options" surfaced in the branding editor's Header tab.
 */
export interface HeaderConfig {
  showLogo: boolean
  showName: boolean
  showCart: boolean
  showSearch: boolean
  tagline: string
  /** Tagline color override; empty string means "inherit subtitle color". */
  taglineColor: string
  sticky: boolean
  blur: boolean
  shadow: boolean
  logoShape: HeaderLogoShape
  height: HeaderHeight
}

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  showLogo: true,
  showName: true,
  showCart: true,
  showSearch: false,
  tagline: '',
  taglineColor: '',
  sticky: true,
  blur: true,
  shadow: false,
  logoShape: 'circle',
  height: 'standard',
}

/**
 * Resolve a tenant record into a fully-populated HeaderConfig with safe defaults.
 * Accepts a loose record so it can be reused on both the Tenant type and raw rows.
 */
export function getHeaderConfig(tenant: Record<string, unknown> | null): HeaderConfig {
  const t = tenant ?? {}

  const bool = (key: string, fallback: boolean): boolean =>
    typeof t[key] === 'boolean' ? (t[key] as boolean) : fallback
  const str = (key: string, fallback: string): string =>
    typeof t[key] === 'string' && t[key] ? (t[key] as string) : fallback

  const logoShape = t['header_logo_shape']
  const height = t['header_height']

  return {
    showLogo: bool('header_show_logo', DEFAULT_HEADER_CONFIG.showLogo),
    showName: bool('header_show_name', DEFAULT_HEADER_CONFIG.showName),
    showCart: bool('header_show_cart', DEFAULT_HEADER_CONFIG.showCart),
    showSearch: bool('header_show_search', DEFAULT_HEADER_CONFIG.showSearch),
    tagline: str('header_tagline', DEFAULT_HEADER_CONFIG.tagline),
    taglineColor: str('header_tagline_color', DEFAULT_HEADER_CONFIG.taglineColor),
    sticky: bool('header_sticky', DEFAULT_HEADER_CONFIG.sticky),
    blur: bool('header_blur', DEFAULT_HEADER_CONFIG.blur),
    shadow: bool('header_shadow', DEFAULT_HEADER_CONFIG.shadow),
    logoShape: (logoShape === 'circle' || logoShape === 'rounded' || logoShape === 'square'
      ? logoShape
      : DEFAULT_HEADER_CONFIG.logoShape) as HeaderLogoShape,
    height: (height === 'compact' || height === 'standard' || height === 'tall'
      ? height
      : DEFAULT_HEADER_CONFIG.height) as HeaderHeight,
  }
}
