'use client'

/**
 * Stock on storefront menu cards: "Sold out" when the kitchen can make a dish
 * 0 times while it is still switched on, and "Only N left" when few remain.
 *
 * ONE shared path for every card design:
 *   - `MenuStockProvider` (mounted once by the menu) reads the producible
 *     ceilings client-side from `/api/inventory/ceilings` through the existing
 *     `useStockCeilings` query (30 s stale, no retry, empty on any failure), so
 *     the menu HTML stays cached / ISR-friendly. Only stores with inventory on
 *     ever ask.
 *   - `CardTemplateRenderer` resolves each card's state with
 *     `resolveMenuCardStock` and hands it down through `CardStockProvider`.
 *   - Templates render `UnavailableLabel` inside their existing veil and
 *     `LowStockBadge` in their image box; neither carries a colour of its own
 *     (branding vars only).
 *
 * Untracked dishes, a branch with no shelf row and never-counted stock have
 * no ceiling, so their cards look exactly as before. Checkout
 * (`checkout-stock-guard.ts`) stays the hard refusal.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { useStockCeilings } from '@/hooks/use-stock-ceilings'
import { StoreLabel, useStorefrontLabel } from '@/components/customer/storefront-labels-provider'
import { fillLabelCount } from '@/lib/storefront-labels'
import type { MenuStockCeilings } from '@/lib/inventory/menu-ceilings'
import type { MenuCardStock } from '@/lib/menu-item-availability'
import type { BrandingColors } from '@/lib/branding-utils'

const NO_CEILINGS: MenuStockCeilings = new Map()
const MenuStockContext = createContext<MenuStockCeilings>(NO_CEILINGS)

interface MenuStockProviderProps {
  tenantId: string | null | undefined
  outletId: string | null
  /** `tenants.inventory_enabled`: without it no dish has a ceiling, so nothing is read. */
  isInventoryEnabled: boolean
  children: ReactNode
}

export function MenuStockProvider({ tenantId, outletId, isInventoryEnabled, children }: MenuStockProviderProps) {
  // A store without inventory mounts no query at all (and needs no QueryClient).
  if (!isInventoryEnabled || !tenantId) {
    return <MenuStockContext.Provider value={NO_CEILINGS}>{children}</MenuStockContext.Provider>
  }
  return <FetchedMenuStock tenantId={tenantId} outletId={outletId}>{children}</FetchedMenuStock>
}

function FetchedMenuStock({ tenantId, outletId, children }: { tenantId: string; outletId: string | null; children: ReactNode }) {
  const ceilings = useStockCeilings(tenantId, outletId)
  return <MenuStockContext.Provider value={ceilings}>{children}</MenuStockContext.Provider>
}

/** One dish's ceiling, or null (untracked / unknown / outside a menu). */
export function useMenuItemCeiling(menuItemId: string): number | null {
  return useContext(MenuStockContext).get(menuItemId) ?? null
}

const NO_STOCK_STATE: MenuCardStock = { isOrderable: true, isSoldOut: false, onlyLeft: null }
const CardStockContext = createContext<MenuCardStock>(NO_STOCK_STATE)

export function CardStockProvider({ stock, children }: { stock: MenuCardStock; children: ReactNode }) {
  return <CardStockContext.Provider value={stock}>{children}</CardStockContext.Provider>
}

export function useCardStock(): MenuCardStock {
  return useContext(CardStockContext)
}

/** The text inside a card's "can't order" veil: "Sold out" for stock, else "Unavailable". */
export function UnavailableLabel() {
  const { isSoldOut } = useCardStock()
  return isSoldOut
    ? <StoreLabel name="menu.sold_out" fallback="Sold out" />
    : <StoreLabel name="menu.unavailable" fallback="Unavailable" />
}

/**
 * Where "Only N left" sits. Never a top corner or top-centre by default: the
 * designs' featured / SALE badges live along the top of the photo, and on
 * 390px phones a top-centre badge ran into them (browser QA 2026-11-05).
 *   - `bottom-left`: the photo's bottom edge is free.
 *   - `bottom-left-clear`: bottom-left, stopping short of a button or price
 *     in the bottom-right corner (round add buttons, the sticker price).
 *   - `above-price`: stacked over modern's bottom-left price tag.
 *   - `top-center`: only for designs whose merch badges sit at the bottom (arch).
 *   - `inline`: in the template's own flow (text overlaid on the photo,
 *     menuboard's thumbnail row), so it cannot overlap anything.
 * `tests/unit/card-template-low-stock-placement.test.tsx` pins every design.
 */
const LOW_STOCK_PLACEMENT_CLASS = {
  'bottom-left': 'absolute bottom-2 left-2 max-w-[calc(100%-1rem)]',
  'bottom-left-clear': 'absolute bottom-2 left-2 max-w-[calc(100%-5.5rem)]',
  'above-price': 'absolute bottom-10 left-2 max-w-[calc(100%-5.5rem)] md:bottom-[4.25rem] md:left-4',
  'top-center': 'absolute left-1/2 top-2 max-w-[calc(100%-1rem)] -translate-x-1/2',
  inline: 'relative inline-block min-w-0 max-w-full align-middle',
} as const

export type LowStockPlacement = keyof typeof LOW_STOCK_PLACEMENT_CLASS

interface LowStockBadgeProps {
  branding: BrandingColors
  placement?: LowStockPlacement
}

/**
 * "Only N left" (the owner's `menu.only_left` wording) in the card's image box
 * (or its flow, see `LowStockPlacement`). Plain text, not a tappable Studio
 * label: the shown words carry the number, which must never be saved back as
 * the label. Long wording truncates.
 */
export function LowStockBadge({ branding, placement = 'bottom-left' }: LowStockBadgeProps) {
  const { onlyLeft } = useCardStock()
  const wording = useStorefrontLabel('menu.only_left', 'Only {count} left')
  if (onlyLeft === null) return null
  const text = fillLabelCount(wording, onlyLeft)
  return (
    <span
      className={`pointer-events-none z-[4] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm md:text-xs ${LOW_STOCK_PLACEMENT_CLASS[placement]}`}
      style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
      data-testid="low-stock-badge"
    >
      {text}
    </span>
  )
}
