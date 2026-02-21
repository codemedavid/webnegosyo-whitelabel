// Ported from web src/lib/branding-utils.ts — keep in sync
// Removed CSS-specific functions (generateBrandingCSS, generateBrandingClasses)

export interface BrandingColors {
  background: string
  header: string
  headerFont: string
  cards: string
  cardsBorder: string
  cardTitle: string
  cardPrice: string
  cardDescription: string
  modalBackground: string
  modalTitle: string
  modalPrice: string
  modalDescription: string
  checkoutModalBackground: string
  checkoutModalTitle: string
  checkoutModalDescription: string
  checkoutModalPrice: string
  checkoutModalButton: string
  checkoutModalButtonText: string
  checkoutModalBorder: string
  buttonPrimary: string
  buttonPrimaryText: string
  buttonSecondary: string
  buttonSecondaryText: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  menuMainHeaderText: string
  menuMainHeaderSubtitle: string
  menuCategoryHeader: string
  menuCategoryActive: string
  menuCategoryInactive: string
  menuCartBadgeBackground: string
  menuCartBadgeText: string
  border: string
  success: string
  warning: string
  error: string
  link: string
  shadow: string
  primary: string
  secondary: string
  accent?: string
}

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
  checkoutModalBackground: '#ffffff',
  checkoutModalTitle: '#111111',
  checkoutModalDescription: '#6b7280',
  checkoutModalPrice: '#111111',
  checkoutModalButton: '#111111',
  checkoutModalButtonText: '#ffffff',
  checkoutModalBorder: '#e5e7eb',
  buttonPrimary: '#111111',
  buttonPrimaryText: '#ffffff',
  buttonSecondary: '#f3f4f6',
  buttonSecondaryText: '#111111',
  textPrimary: '#111111',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  menuMainHeaderText: '#111111',
  menuMainHeaderSubtitle: '#9ca3af',
  menuCategoryHeader: '#111111',
  menuCategoryActive: '#111111',
  menuCategoryInactive: '#6b7280',
  menuCartBadgeBackground: '#111111',
  menuCartBadgeText: '#ffffff',
  border: '#e5e7eb',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  link: '#3b82f6',
  shadow: 'rgba(0, 0, 0, 0.1)',
  primary: '#111111',
  secondary: '#666666',
  accent: '#ffd700',
}

export function getTenantBranding(tenant: Record<string, unknown> | null): BrandingColors {
  if (!tenant) return DEFAULT_BRANDING

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
    checkoutModalBackground: get('checkout_modal_background_color', '') || get('modal_background_color', '') || get('cards_color', DEFAULT_BRANDING.checkoutModalBackground),
    checkoutModalTitle: get('checkout_modal_title_color', '') || get('modal_title_color', '') || get('text_primary_color', DEFAULT_BRANDING.checkoutModalTitle),
    checkoutModalDescription: get('checkout_modal_description_color', '') || get('modal_description_color', '') || get('text_secondary_color', DEFAULT_BRANDING.checkoutModalDescription),
    checkoutModalPrice: get('checkout_modal_price_color', '') || get('modal_price_color', '') || get('primary_color', DEFAULT_BRANDING.checkoutModalPrice),
    checkoutModalButton: get('checkout_modal_button_color', '') || get('button_primary_color', '') || get('primary_color', DEFAULT_BRANDING.checkoutModalButton),
    checkoutModalButtonText: get('checkout_modal_button_text_color', '') || get('button_primary_text_color', DEFAULT_BRANDING.checkoutModalButtonText),
    checkoutModalBorder: get('checkout_modal_border_color', '') || get('border_color', DEFAULT_BRANDING.checkoutModalBorder),
    buttonPrimary: get('button_primary_color', '') || get('primary_color', DEFAULT_BRANDING.buttonPrimary),
    buttonPrimaryText: get('button_primary_text_color', DEFAULT_BRANDING.buttonPrimaryText),
    buttonSecondary: get('button_secondary_color', DEFAULT_BRANDING.buttonSecondary),
    buttonSecondaryText: get('button_secondary_text_color', DEFAULT_BRANDING.buttonSecondaryText),
    textPrimary: get('text_primary_color', DEFAULT_BRANDING.textPrimary),
    textSecondary: get('text_secondary_color', DEFAULT_BRANDING.textSecondary),
    textMuted: get('text_muted_color', DEFAULT_BRANDING.textMuted),
    menuMainHeaderText: get('menu_main_header_text_color', '') || get('text_primary_color', DEFAULT_BRANDING.menuMainHeaderText),
    menuMainHeaderSubtitle: get('menu_main_header_subtitle_color', '') || get('text_muted_color', DEFAULT_BRANDING.menuMainHeaderSubtitle),
    menuCategoryHeader: get('menu_category_header_color', '') || get('primary_color', DEFAULT_BRANDING.menuCategoryHeader),
    menuCategoryActive: get('menu_category_active_color', '') || get('primary_color', DEFAULT_BRANDING.menuCategoryActive),
    menuCategoryInactive: get('menu_category_inactive_color', '') || get('text_secondary_color', DEFAULT_BRANDING.menuCategoryInactive),
    menuCartBadgeBackground: get('menu_cart_badge_background_color', '') || get('primary_color', DEFAULT_BRANDING.menuCartBadgeBackground),
    menuCartBadgeText: get('menu_cart_badge_text_color', '') || get('button_primary_text_color', DEFAULT_BRANDING.menuCartBadgeText),
    border: get('border_color', DEFAULT_BRANDING.border),
    success: get('success_color', DEFAULT_BRANDING.success),
    warning: get('warning_color', DEFAULT_BRANDING.warning),
    error: get('error_color', DEFAULT_BRANDING.error),
    link: get('link_color', DEFAULT_BRANDING.link),
    shadow: get('shadow_color', DEFAULT_BRANDING.shadow),
    primary: get('primary_color', DEFAULT_BRANDING.primary),
    secondary: get('secondary_color', DEFAULT_BRANDING.secondary),
    accent: get('accent_color', DEFAULT_BRANDING.accent || ''),
  }
}

export function getContrastColor(backgroundColor: string): string {
  const hex = backgroundColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

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

export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null
}

export function setAlpha(color: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, alpha))
  const trimmed = color.trim()

  const hexMatch = /^#([A-Fa-f0-9]{3,8})$/.exec(trimmed)
  if (hexMatch) {
    const hex = hexMatch[1]
    let r: number, g: number, b: number
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
    } else if (hex.length === 8) {
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
    } else {
      return `rgba(0, 0, 0, ${clampedAlpha})`
    }
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
  }

  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${clampedAlpha})`
  }

  return `rgba(0, 0, 0, ${clampedAlpha})`
}
