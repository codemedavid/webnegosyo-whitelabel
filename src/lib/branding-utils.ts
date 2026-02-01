/**
 * Branding utilities for tenant customization
 * Provides fallback colors and utility functions for consistent branding
 */

// Tenant type was removed - function accepts generic Record<string, unknown> instead

export interface BrandingColors {
  // Layout colors
  background: string
  header: string
  headerFont: string
  cards: string
  cardsBorder: string

  // Card text colors
  cardTitle: string
  cardPrice: string
  cardDescription: string

  // Modal colors
  modalBackground: string
  modalTitle: string
  modalPrice: string
  modalDescription: string

  // Button colors
  buttonPrimary: string
  buttonPrimaryText: string
  buttonSecondary: string
  buttonSecondaryText: string

  // Text colors
  textPrimary: string
  textSecondary: string
  textMuted: string

  // UI colors
  border: string
  success: string
  warning: string
  error: string
  link: string
  shadow: string

  // Legacy colors (for backward compatibility)
  primary: string
  secondary: string
  accent?: string
}

/**
 * Default branding colors
 */
export const DEFAULT_BRANDING: BrandingColors = {
  background: '#ffffff',
  header: '#ffffff',
  headerFont: '#000000',
  cards: '#ffffff',
  cardsBorder: '#e5e7eb',
  cardTitle: '#111111',
  cardPrice: '#111111',
  cardDescription: '#6b7280',
  modalBackground: '#ffffff',
  modalTitle: '#111111',
  modalPrice: '#111111',
  modalDescription: '#6b7280',
  buttonPrimary: '#111111',
  buttonPrimaryText: '#ffffff',
  buttonSecondary: '#f3f4f6',
  buttonSecondaryText: '#111111',
  textPrimary: '#111111',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  link: '#3b82f6',
  shadow: 'rgba(0, 0, 0, 0.1)',
  primary: '#111111',
  secondary: '#666666',
  accent: '#ffd700'
}

/**
 * Extract branding colors from tenant with fallbacks
 */
export function getTenantBranding(tenant: Record<string, unknown> | null): BrandingColors {
  if (!tenant) {
    return DEFAULT_BRANDING
  }

  // Helper to safely get string properties with fallback
  const get = (key: string, fallback: string): string => {
    const value = tenant[key]
    return typeof value === 'string' ? value : fallback
  }

  return {
    background: get('background_color', DEFAULT_BRANDING.background),
    header: get('header_color', DEFAULT_BRANDING.header),
    headerFont: get('header_font_color', DEFAULT_BRANDING.headerFont),
    cards: get('cards_color', DEFAULT_BRANDING.cards),
    cardsBorder: get('cards_border_color', DEFAULT_BRANDING.cardsBorder),
    cardTitle: get('card_title_color', '') || get('text_primary_color', DEFAULT_BRANDING.cardTitle),
    cardPrice: get('card_price_color', '') || get('primary_color', DEFAULT_BRANDING.cardPrice),
    cardDescription: get('card_description_color', '') || get('text_secondary_color', DEFAULT_BRANDING.cardDescription),
    modalBackground: get('modal_background_color', '') || get('cards_color', DEFAULT_BRANDING.modalBackground),
    modalTitle: get('modal_title_color', '') || get('text_primary_color', DEFAULT_BRANDING.modalTitle),
    modalPrice: get('modal_price_color', '') || get('primary_color', DEFAULT_BRANDING.modalPrice),
    modalDescription: get('modal_description_color', '') || get('text_secondary_color', DEFAULT_BRANDING.modalDescription),
    buttonPrimary: get('button_primary_color', '') || get('primary_color', DEFAULT_BRANDING.buttonPrimary),
    buttonPrimaryText: get('button_primary_text_color', DEFAULT_BRANDING.buttonPrimaryText),
    buttonSecondary: get('button_secondary_color', DEFAULT_BRANDING.buttonSecondary),
    buttonSecondaryText: get('button_secondary_text_color', DEFAULT_BRANDING.buttonSecondaryText),
    textPrimary: get('text_primary_color', DEFAULT_BRANDING.textPrimary),
    textSecondary: get('text_secondary_color', DEFAULT_BRANDING.textSecondary),
    textMuted: get('text_muted_color', DEFAULT_BRANDING.textMuted),
    border: get('border_color', DEFAULT_BRANDING.border),
    success: get('success_color', DEFAULT_BRANDING.success),
    warning: get('warning_color', DEFAULT_BRANDING.warning),
    error: get('error_color', DEFAULT_BRANDING.error),
    link: get('link_color', DEFAULT_BRANDING.link),
    shadow: get('shadow_color', DEFAULT_BRANDING.shadow),
    primary: get('primary_color', DEFAULT_BRANDING.primary),
    secondary: get('secondary_color', DEFAULT_BRANDING.secondary),
    accent: get('accent_color', DEFAULT_BRANDING.accent || '')
  }
}

/**
 * Generate CSS custom properties for tenant branding
 */
export function generateBrandingCSS(branding: BrandingColors): React.CSSProperties {
  return {
    '--brand-background': branding.background,
    '--brand-header': branding.header,
    '--brand-header-font': branding.headerFont,
    '--brand-cards': branding.cards,
    '--brand-cards-border': branding.cardsBorder,
    '--brand-card-title': branding.cardTitle,
    '--brand-card-price': branding.cardPrice,
    '--brand-card-description': branding.cardDescription,
    '--brand-modal-background': branding.modalBackground,
    '--brand-modal-title': branding.modalTitle,
    '--brand-modal-price': branding.modalPrice,
    '--brand-modal-description': branding.modalDescription,
    '--brand-button-primary': branding.buttonPrimary,
    '--brand-button-primary-text': branding.buttonPrimaryText,
    '--brand-button-secondary': branding.buttonSecondary,
    '--brand-button-secondary-text': branding.buttonSecondaryText,
    '--brand-text-primary': branding.textPrimary,
    '--brand-text-secondary': branding.textSecondary,
    '--brand-text-muted': branding.textMuted,
    '--brand-border': branding.border,
    '--brand-success': branding.success,
    '--brand-warning': branding.warning,
    '--brand-error': branding.error,
    '--brand-link': branding.link,
    '--brand-shadow': branding.shadow,
    '--brand-primary': branding.primary,
    '--brand-secondary': branding.secondary,
    '--brand-accent': branding.accent || branding.primary,
  } as React.CSSProperties
}

/**
 * Get contrast color (black or white) for text on a background
 */
export function getContrastColor(backgroundColor: string): string {
  // Remove # if present
  const hex = backgroundColor.replace('#', '')

  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return luminance > 0.5 ? '#000000' : '#ffffff'
}

/**
 * Generate a lighter version of a color
 */
export function lightenColor(color: string, amount: number = 0.1): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  const newR = Math.min(255, Math.floor(r + (255 - r) * amount))
  const newG = Math.min(255, Math.floor(g + (255 - g) * amount))
  const newB = Math.min(255, Math.floor(b + (255 - b) * amount))

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

/**
 * Generate a darker version of a color
 */
export function darkenColor(color: string, amount: number = 0.1): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  const newR = Math.max(0, Math.floor(r * (1 - amount)))
  const newG = Math.max(0, Math.floor(g * (1 - amount)))
  const newB = Math.max(0, Math.floor(b * (1 - amount)))

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

/**
 * Validate if a color is a valid hex color
 */
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

/**
 * Convert RGB to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/**
 * Set the alpha (opacity) of a color string.
 * Handles hex (#RGB, #RRGGBB, #RRGGBBAA), rgb(a), and hsl(a) formats.
 * Returns rgba() or hsla() string with the specified alpha.
 * 
 * @param color - The color string to modify
 * @param alpha - Alpha value between 0 and 1
 * @returns Color string with alpha applied, or fallback if parsing fails
 */
export function setAlpha(color: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, alpha))
  const trimmed = color.trim()

  // Handle hex colors (#RGB, #RRGGBB, #RRGGBBAA)
  const hexMatch = /^#([A-Fa-f0-9]{3,8})$/.exec(trimmed)
  if (hexMatch) {
    const hex = hexMatch[1]
    let r: number, g: number, b: number

    if (hex.length === 3) {
      // #RGB -> #RRGGBB
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else if (hex.length === 4) {
      // #RGBA -> ignore existing alpha
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else if (hex.length === 6) {
      // #RRGGBB
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
    } else if (hex.length === 8) {
      // #RRGGBBAA -> ignore existing alpha
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
    } else {
      // Invalid hex length, return fallback
      return `rgba(0, 0, 0, ${clampedAlpha})`
    }

    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
  }

  // Handle rgb() and rgba()
  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10)
    const g = parseInt(rgbMatch[2], 10)
    const b = parseInt(rgbMatch[3], 10)
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
  }

  // Handle hsl() and hsla()
  const hslMatch = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
  if (hslMatch) {
    const h = parseFloat(hslMatch[1])
    const s = parseFloat(hslMatch[2])
    const l = parseFloat(hslMatch[3])
    return `hsla(${h}, ${s}%, ${l}%, ${clampedAlpha})`
  }

  // Fallback: if color format is unrecognized, return a transparent black with the alpha
  // This prevents runtime errors while being visually noticeable for debugging
  return `rgba(0, 0, 0, ${clampedAlpha})`
}

/**
 * Generate CSS classes for tenant branding
 */
export function generateBrandingClasses(branding: BrandingColors): string {
  return `
    .brand-bg { background-color: ${branding.background} !important; }
    .brand-header { background-color: ${branding.header} !important; color: ${branding.headerFont} !important; }
    .brand-cards { background-color: ${branding.cards} !important; border-color: ${branding.cardsBorder} !important; }
    .brand-card-title { color: ${branding.cardTitle} !important; }
    .brand-card-price { color: ${branding.cardPrice} !important; }
    .brand-card-description { color: ${branding.cardDescription} !important; }
    .brand-button-primary { background-color: ${branding.buttonPrimary} !important; color: ${branding.buttonPrimaryText} !important; }
    .brand-button-secondary { background-color: ${branding.buttonSecondary} !important; color: ${branding.buttonSecondaryText} !important; }
    .brand-text-primary { color: ${branding.textPrimary} !important; }
    .brand-text-secondary { color: ${branding.textSecondary} !important; }
    .brand-text-muted { color: ${branding.textMuted} !important; }
    .brand-border { border-color: ${branding.border} !important; }
    .brand-success { color: ${branding.success} !important; }
    .brand-warning { color: ${branding.warning} !important; }
    .brand-error { color: ${branding.error} !important; }
    .brand-link { color: ${branding.link} !important; }
  `
}
