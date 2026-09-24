'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { AnnouncementBar } from '@/components/customer/announcement-bar'
import { StoreClosedBanner } from '@/components/customer/store-closed-banner'
import type { MenuItem } from '@/types/database'
import { useStorefrontRuntime } from '../../runtime/storefront-runtime'
import { BiteSpeedFonts } from './fonts'
import { bitespeedRootStyle } from './tokens'

/** Card shadow from the BiteSpeed design. */
export const BITESPEED_CARD_SHADOW = '0px 8px 24px rgba(0,0,0,0.08)'

/** The themed page root every BiteSpeed page renders inside. */
export function BiteSpeedRoot({ children }: { children: ReactNode }) {
  const { menu, branding } = useStorefrontRuntime()
  return (
    <div data-branding-scope="global/palette" className="min-h-screen antialiased" style={bitespeedRootStyle(branding)}>
      <BiteSpeedFonts />
      <AnnouncementBar tenant={menu.tenant} />
      <StoreClosedBanner status={menu.openStatus} />
      {children}
    </div>
  )
}

/** Links between the pack's pages. Tenant-prefixed, like every storefront link. */
export function useBiteSpeedRoutes() {
  const { tenantSlug } = useStorefrontRuntime().menu
  return { home: `/${tenantSlug}`, menu: `/${tenantSlug}/menu` }
}

/** A dish's shown price: the discounted price when it is lower. */
export function itemPricing(item: MenuItem) {
  const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
  return {
    price: hasDiscount ? (item.discounted_price as number) : item.price,
    compareAt: hasDiscount ? item.price : undefined,
    hasOptions: (item.variations?.length ?? 0) > 0 || (item.variation_types?.length ?? 0) > 0,
  }
}

/** Whether the storefront hides the ₱ symbol (a menu-engineering option). */
export function useHideCurrencySymbol() {
  const { tenant } = useStorefrontRuntime().menu
  return Boolean(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)
}

/**
 * The "Order" action from the nav, tab bar and order bar: straight to
 * checkout through the shared gate, or a nudge when nothing is in the cart yet.
 */
export function useOrderAction() {
  const { menu, requestCheckout } = useStorefrontRuntime()
  return () => {
    if (menu.itemCount === 0) {
      toast.info('Your order is empty — add something from the menu first.')
      return
    }
    requestCheckout()
  }
}

/** Section heading in the display face, with an optional line underneath. */
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[28px] font-bold leading-9 tracking-[-0.01em] md:text-[32px] md:leading-10" style={{ fontFamily: 'var(--bs-font-display)' }}>
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-base text-[var(--bs-text-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
