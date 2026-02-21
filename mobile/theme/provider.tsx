import React, { createContext, useContext, useMemo } from 'react'
import { getTenantBranding, DEFAULT_BRANDING } from '@/lib/branding-utils'
import { useTenant } from '@/lib/queries/use-tenant'
import type { ThemeContextValue, MobileTheme } from '@/theme/types'

// Expo inlines process.env.EXPO_PUBLIC_* at build time via babel.
// Dynamic access (process.env[variable]) does NOT work — must use static references.
function clean(val: string | undefined): string | undefined {
  if (!val || !val.trim()) return undefined
  return val.trim().replace(/^["']|["']$/g, '')
}

function cleanBoolean(val: string | undefined): boolean | undefined {
  const normalized = clean(val)?.toLowerCase()
  if (!normalized) return undefined
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

const GLOBAL_BRANDING_OVERRIDES: Partial<MobileTheme> = {
  ...(clean(process.env.EXPO_PUBLIC_BRAND_BACKGROUND) ? { background: clean(process.env.EXPO_PUBLIC_BRAND_BACKGROUND)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_HEADER) ? { header: clean(process.env.EXPO_PUBLIC_BRAND_HEADER)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_HEADER_FONT) ? { headerFont: clean(process.env.EXPO_PUBLIC_BRAND_HEADER_FONT)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_CARDS) ? { cards: clean(process.env.EXPO_PUBLIC_BRAND_CARDS)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_CARDS_BORDER) ? { cardsBorder: clean(process.env.EXPO_PUBLIC_BRAND_CARDS_BORDER)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_CARD_TITLE) ? { cardTitle: clean(process.env.EXPO_PUBLIC_BRAND_CARD_TITLE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_CARD_PRICE) ? { cardPrice: clean(process.env.EXPO_PUBLIC_BRAND_CARD_PRICE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_CARD_DESCRIPTION) ? { cardDescription: clean(process.env.EXPO_PUBLIC_BRAND_CARD_DESCRIPTION)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MODAL_BACKGROUND) ? { modalBackground: clean(process.env.EXPO_PUBLIC_BRAND_MODAL_BACKGROUND)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MODAL_TITLE) ? { modalTitle: clean(process.env.EXPO_PUBLIC_BRAND_MODAL_TITLE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MODAL_PRICE) ? { modalPrice: clean(process.env.EXPO_PUBLIC_BRAND_MODAL_PRICE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MODAL_DESCRIPTION) ? { modalDescription: clean(process.env.EXPO_PUBLIC_BRAND_MODAL_DESCRIPTION)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_PRIMARY) ? { buttonPrimary: clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_PRIMARY)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_PRIMARY_TEXT) ? { buttonPrimaryText: clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_PRIMARY_TEXT)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_SECONDARY) ? { buttonSecondary: clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_SECONDARY)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_SECONDARY_TEXT) ? { buttonSecondaryText: clean(process.env.EXPO_PUBLIC_BRAND_BUTTON_SECONDARY_TEXT)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_TEXT_PRIMARY) ? { textPrimary: clean(process.env.EXPO_PUBLIC_BRAND_TEXT_PRIMARY)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_TEXT_SECONDARY) ? { textSecondary: clean(process.env.EXPO_PUBLIC_BRAND_TEXT_SECONDARY)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_TEXT_MUTED) ? { textMuted: clean(process.env.EXPO_PUBLIC_BRAND_TEXT_MUTED)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_MAIN_HEADER_TEXT) ? { menuMainHeaderText: clean(process.env.EXPO_PUBLIC_BRAND_MENU_MAIN_HEADER_TEXT)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_MAIN_HEADER_SUBTITLE) ? { menuMainHeaderSubtitle: clean(process.env.EXPO_PUBLIC_BRAND_MENU_MAIN_HEADER_SUBTITLE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_CATEGORY_HEADER) ? { menuCategoryHeader: clean(process.env.EXPO_PUBLIC_BRAND_MENU_CATEGORY_HEADER)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_CATEGORY_ACTIVE) ? { menuCategoryActive: clean(process.env.EXPO_PUBLIC_BRAND_MENU_CATEGORY_ACTIVE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_CATEGORY_INACTIVE) ? { menuCategoryInactive: clean(process.env.EXPO_PUBLIC_BRAND_MENU_CATEGORY_INACTIVE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_CART_BADGE_BACKGROUND) ? { menuCartBadgeBackground: clean(process.env.EXPO_PUBLIC_BRAND_MENU_CART_BADGE_BACKGROUND)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_MENU_CART_BADGE_TEXT) ? { menuCartBadgeText: clean(process.env.EXPO_PUBLIC_BRAND_MENU_CART_BADGE_TEXT)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_BORDER) ? { border: clean(process.env.EXPO_PUBLIC_BRAND_BORDER)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_SUCCESS) ? { success: clean(process.env.EXPO_PUBLIC_BRAND_SUCCESS)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_WARNING) ? { warning: clean(process.env.EXPO_PUBLIC_BRAND_WARNING)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_ERROR) ? { error: clean(process.env.EXPO_PUBLIC_BRAND_ERROR)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_LINK) ? { link: clean(process.env.EXPO_PUBLIC_BRAND_LINK)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_SHADOW) ? { shadow: clean(process.env.EXPO_PUBLIC_BRAND_SHADOW)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_PRIMARY) ? { primary: clean(process.env.EXPO_PUBLIC_BRAND_PRIMARY)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_SECONDARY) ? { secondary: clean(process.env.EXPO_PUBLIC_BRAND_SECONDARY)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_BRAND_ACCENT) ? { accent: clean(process.env.EXPO_PUBLIC_BRAND_ACCENT)! } : {}),
}

const CHECKOUT_OVERRIDES: Partial<MobileTheme> = {
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_BG) ? { checkoutModalBackground: clean(process.env.EXPO_PUBLIC_CHECKOUT_BG)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_TITLE) ? { checkoutModalTitle: clean(process.env.EXPO_PUBLIC_CHECKOUT_TITLE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_DESCRIPTION) ? { checkoutModalDescription: clean(process.env.EXPO_PUBLIC_CHECKOUT_DESCRIPTION)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_PRICE) ? { checkoutModalPrice: clean(process.env.EXPO_PUBLIC_CHECKOUT_PRICE)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_BUTTON) ? { checkoutModalButton: clean(process.env.EXPO_PUBLIC_CHECKOUT_BUTTON)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_BUTTON_TEXT) ? { checkoutModalButtonText: clean(process.env.EXPO_PUBLIC_CHECKOUT_BUTTON_TEXT)! } : {}),
  ...(clean(process.env.EXPO_PUBLIC_CHECKOUT_BORDER) ? { checkoutModalBorder: clean(process.env.EXPO_PUBLIC_CHECKOUT_BORDER)! } : {}),
}

const ENV_OVERRIDES: Partial<MobileTheme> = {
  ...GLOBAL_BRANDING_OVERRIDES,
  ...CHECKOUT_OVERRIDES,
}

// Order confirmation overrides
export const CONFIRMATION_OVERRIDES = {
  bg: clean(process.env.EXPO_PUBLIC_CONFIRMATION_BG),
  title: clean(process.env.EXPO_PUBLIC_CONFIRMATION_TITLE),
  subtitle: clean(process.env.EXPO_PUBLIC_CONFIRMATION_SUBTITLE),
  cardBg: clean(process.env.EXPO_PUBLIC_CONFIRMATION_CARD_BG),
  cardBorder: clean(process.env.EXPO_PUBLIC_CONFIRMATION_CARD_BORDER),
  label: clean(process.env.EXPO_PUBLIC_CONFIRMATION_LABEL),
  value: clean(process.env.EXPO_PUBLIC_CONFIRMATION_VALUE),
  totalLabel: clean(process.env.EXPO_PUBLIC_CONFIRMATION_TOTAL_LABEL),
  totalValue: clean(process.env.EXPO_PUBLIC_CONFIRMATION_TOTAL_VALUE),
  divider: clean(process.env.EXPO_PUBLIC_CONFIRMATION_DIVIDER),
  successIcon: clean(process.env.EXPO_PUBLIC_CONFIRMATION_SUCCESS_ICON),
  successBg: clean(process.env.EXPO_PUBLIC_CONFIRMATION_SUCCESS_BG),
  buttonBg: clean(process.env.EXPO_PUBLIC_CONFIRMATION_BUTTON_BG),
  buttonText: clean(process.env.EXPO_PUBLIC_CONFIRMATION_BUTTON_TEXT),
  footerNote: clean(process.env.EXPO_PUBLIC_CONFIRMATION_FOOTER_NOTE),
}

// Order type card overrides
export const ORDER_TYPE_CARD_OVERRIDES = {
  cardBg: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_CARD_BG),
  cardBorder: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_CARD_BORDER),
  iconBg: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_ICON_BG),
  iconColor: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_ICON_COLOR),
  titleColor: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_TITLE_COLOR),
  descriptionColor: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_DESCRIPTION_COLOR),
  arrowBg: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_ARROW_BG),
  arrowColor: clean(process.env.EXPO_PUBLIC_ORDER_TYPE_ARROW_COLOR),
}

export const HOME_BRANDING_OVERRIDES = {
  headerTitle: clean(process.env.EXPO_PUBLIC_HOME_HEADER_TITLE),
  headerSubtitle: clean(process.env.EXPO_PUBLIC_HOME_HEADER_SUBTITLE),
  heroTitle: clean(process.env.EXPO_PUBLIC_HOME_HERO_TITLE),
  heroDescription: clean(process.env.EXPO_PUBLIC_HOME_HERO_DESCRIPTION),
  orderTypeTitle: clean(process.env.EXPO_PUBLIC_HOME_ORDER_TYPE_TITLE),
  orderTypeSubtitle: clean(process.env.EXPO_PUBLIC_HOME_ORDER_TYPE_SUBTITLE),
  showLogo: cleanBoolean(process.env.EXPO_PUBLIC_HOME_SHOW_LOGO),
}

export const CART_BRANDING_OVERRIDES = {
  title: clean(process.env.EXPO_PUBLIC_CART_TITLE),
  backTitle: clean(process.env.EXPO_PUBLIC_CART_BACK_TITLE),
  emptyTitle: clean(process.env.EXPO_PUBLIC_CART_EMPTY_TITLE),
  emptySubtitle: clean(process.env.EXPO_PUBLIC_CART_EMPTY_SUBTITLE),
  iconName: clean(process.env.EXPO_PUBLIC_CART_ICON_NAME),
  iconColor: clean(process.env.EXPO_PUBLIC_CART_ICON_COLOR),
  emptyIconColor: clean(process.env.EXPO_PUBLIC_CART_EMPTY_ICON_COLOR),
  browseButtonText: clean(process.env.EXPO_PUBLIC_CART_BROWSE_BUTTON_TEXT),
  checkoutButtonText: clean(process.env.EXPO_PUBLIC_CART_CHECKOUT_BUTTON_TEXT),
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_BRANDING as MobileTheme,
  tenant: null,
  isLoading: true,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: tenant, isLoading } = useTenant()

  const theme = useMemo<MobileTheme>(() => {
    const base = !tenant ? DEFAULT_BRANDING as MobileTheme : getTenantBranding(tenant) as MobileTheme
    // Apply .env overrides on top
    return { ...base, ...ENV_OVERRIDES }
  }, [tenant])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, tenant: tenant ?? null, isLoading }),
    [theme, tenant, isLoading]
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
