import type { Device, ThemeColorKey } from './types'

export const DESIGN_VERSION = 5 as const

/**
 * Breakpoints are container widths, not viewport widths: the renderer's root
 * is a CSS container, so the editor's 390px canvas renders the real mobile
 * layout inside a wide browser window.
 */
export const DEVICE_MAX_WIDTH: Record<Exclude<Device, 'desktop'>, number> = {
  tablet: 1023.98,
  mobile: 767.98,
}

/** Slideshow timing bounds, in seconds per slide. */
export const SLIDE_INTERVAL = { min: 2, max: 15, fallback: 5 } as const

export const DEVICES: readonly Device[] = ['desktop', 'tablet', 'mobile']

export const CANVAS_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: 820,
  mobile: 390,
}

export const LIMITS = {
  sections: 24,
  columnsPerSection: 6,
  widgetsTotal: 240,
  buttonsPerWidget: 4,
  listItems: 24,
  galleryImages: 24,
  slides: 12,
  textLength: 4_000,
  shortText: 300,
  htmlLength: 50_000,
  embedLength: 50_000,
  urlLength: 2_048,
  designBytes: 600_000,
  historyDepth: 80,
  embedMaxHeight: 4_000,
} as const

export const THEME_COLOR_KEYS: readonly ThemeColorKey[] = [
  'primary',
  'secondary',
  'accent',
  'text',
  'muted',
  'background',
  'surface',
]

/** Where each theme color falls back to when the merchant leaves it blank. */
export const THEME_COLOR_FALLBACK: Record<ThemeColorKey, string> = {
  primary: 'var(--brand-primary, #111827)',
  secondary: 'var(--brand-secondary, #4b5563)',
  accent: 'var(--brand-accent, var(--brand-primary, #ea580c))',
  text: 'var(--brand-text-primary, #111827)',
  muted: 'var(--brand-text-secondary, #6b7280)',
  background: 'var(--brand-background, #ffffff)',
  surface: 'var(--brand-cards, #f9fafb)',
}

export const THEME_COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  text: 'Text',
  muted: 'Muted text',
  background: 'Background',
  surface: 'Surface',
}

export interface FontOption {
  label: string
  /** CSS font-family value. */
  css: string
  /** Google Fonts family + weights to load, or null for built-ins / tokens. */
  google: { family: string; weights: readonly number[] } | null
}

/**
 * Fonts a design may use. `heading` / `body` follow the design theme, which in
 * turn follows the store's font pairing. Only fonts actually used by a design
 * are downloaded.
 */
export const FONT_OPTIONS: Record<string, FontOption> = {
  heading: { label: 'Theme heading', css: 'var(--hb-heading-font)', google: null },
  body: { label: 'Theme body', css: 'var(--hb-body-font)', google: null },
  system: {
    label: 'System',
    css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    google: null,
  },
  inter: { label: 'Inter', css: "'Inter', sans-serif", google: { family: 'Inter', weights: [400, 500, 600, 700, 800] } },
  poppins: { label: 'Poppins', css: "'Poppins', sans-serif", google: { family: 'Poppins', weights: [400, 500, 600, 700, 800] } },
  montserrat: { label: 'Montserrat', css: "'Montserrat', sans-serif", google: { family: 'Montserrat', weights: [400, 500, 600, 700, 800] } },
  'dm-sans': { label: 'DM Sans', css: "'DM Sans', sans-serif", google: { family: 'DM Sans', weights: [400, 500, 700] } },
  'space-grotesk': { label: 'Space Grotesk', css: "'Space Grotesk', sans-serif", google: { family: 'Space Grotesk', weights: [400, 500, 700] } },
  archivo: { label: 'Archivo', css: "'Archivo', sans-serif", google: { family: 'Archivo', weights: [400, 500, 700, 900] } },
  nunito: { label: 'Nunito', css: "'Nunito', sans-serif", google: { family: 'Nunito', weights: [400, 600, 700, 800] } },
  karla: { label: 'Karla', css: "'Karla', sans-serif", google: { family: 'Karla', weights: [400, 500, 700] } },
  'playfair-display': { label: 'Playfair Display', css: "'Playfair Display', serif", google: { family: 'Playfair Display', weights: [400, 600, 700, 800] } },
  'dm-serif-display': { label: 'DM Serif Display', css: "'DM Serif Display', serif", google: { family: 'DM Serif Display', weights: [400] } },
  fraunces: { label: 'Fraunces', css: "'Fraunces', serif", google: { family: 'Fraunces', weights: [400, 600, 700, 900] } },
  lora: { label: 'Lora', css: "'Lora', serif", google: { family: 'Lora', weights: [400, 500, 600, 700] } },
  'cormorant-garamond': { label: 'Cormorant Garamond', css: "'Cormorant Garamond', serif", google: { family: 'Cormorant Garamond', weights: [500, 600, 700] } },
  anton: { label: 'Anton', css: "'Anton', sans-serif", google: { family: 'Anton', weights: [400] } },
  'bebas-neue': { label: 'Bebas Neue', css: "'Bebas Neue', sans-serif", google: { family: 'Bebas Neue', weights: [400] } },
  oswald: { label: 'Oswald', css: "'Oswald', sans-serif", google: { family: 'Oswald', weights: [400, 500, 600, 700] } },
  caveat: { label: 'Caveat', css: "'Caveat', cursive", google: { family: 'Caveat', weights: [400, 600, 700] } },
  pacifico: { label: 'Pacifico', css: "'Pacifico', cursive", google: { family: 'Pacifico', weights: [400] } },
}

export const THEME_FONT_OPTIONS: readonly string[] = Object.keys(FONT_OPTIONS).filter(
  (key) => key !== 'heading' && key !== 'body',
)

export const SHADOWS: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgba(15,23,42,.08)',
  md: '0 4px 12px rgba(15,23,42,.10)',
  lg: '0 12px 32px rgba(15,23,42,.14)',
  xl: '0 24px 60px rgba(15,23,42,.20)',
}
