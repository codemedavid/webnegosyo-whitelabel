'use client'

import { ArrowRight, Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { WelcomeBannersRail } from '@/components/customer/welcome-banners-rail'
import {
  normalizeWelcomeBanners,
  resolveWelcomeCtaText,
  resolveWelcomeTheme,
  shouldShowOrderTypeStep,
  type WelcomeTenantFields,
} from '@/lib/outlets/welcome-page'
import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'
import { OUTLET_MODE_LABELS } from '@/lib/outlets/outlet-modes'

interface OutletModeScreenProps {
  tenantName: string
  /** Legacy flash-screen promo, shown only when no welcome banners exist. */
  promoImageUrl?: string | null
  promoHeadline?: string | null
  /** Only the modes at least one branch can actually fulfill. */
  modes: readonly OutletOrderMode[]
  /** Why we are asking again — drives the explanatory line, if any. */
  message?: string | null
  onSelect: (mode: OutletOrderMode) => void
  /**
   * Welcome-page design columns from the tenant row; null/absent renders the
   * screen exactly as it shipped before the page became designable.
   */
  welcome?: WelcomeTenantFields | null
  /** Pressed when the page shows the single CTA instead of the mode tiles. */
  onStartOrdering?: () => void
}

const MODE_ICONS: Record<OutletOrderMode, typeof Bike> = {
  dine_in: UtensilsCrossed,
  pickup: ShoppingBag,
  delivery: Bike,
}

const MODE_BLURBS: Record<OutletOrderMode, string> = {
  dine_in: 'Eat with us',
  pickup: 'Collect in store',
  delivery: 'Straight to you',
}

/**
 * First screen of the branch flow — now the merchant's WELCOME page.
 *
 * Two entries, chosen per tenant in the Branding Studio:
 *  - order-type tiles (the shipped default): how does the customer want their
 *    order? Mode comes before branch because it narrows the branch list.
 *  - a single big call-to-action that skips the question entirely and goes
 *    straight to the branch list; the order type is asked at checkout.
 *
 * Promo banners and palette come from the tenant's welcome_* columns; an
 * unconfigured tenant renders exactly the screen that shipped first.
 */
export function OutletModeScreen({
  tenantName,
  promoImageUrl,
  promoHeadline,
  modes,
  message,
  onSelect,
  welcome,
  onStartOrdering,
}: OutletModeScreenProps) {
  const theme = resolveWelcomeTheme(welcome)
  const banners = normalizeWelcomeBanners(welcome?.welcome_page_banners)
  const showTiles = shouldShowOrderTypeStep(welcome)

  const heading =
    welcome?.welcome_heading_text?.trim() || promoHeadline || `Welcome to ${tenantName}`
  const subheading =
    welcome?.welcome_subheading_text?.trim() ||
    (showTiles ? 'How would you like your order?' : 'Find the branch nearest you')

  return (
    <div
      className="flex min-h-full w-full flex-col gap-7 px-5 py-8"
      style={{ backgroundColor: theme.backgroundColor ?? undefined }}
    >
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: theme.headingColor ?? undefined }}
        >
          {heading}
        </h1>
        <p className="mt-1 text-muted-foreground" style={{ color: theme.subtextColor ?? undefined }}>
          {subheading}
        </p>
        {message && <p className="mt-2 text-sm text-amber-600">{message}</p>}
      </div>

      {banners.length > 0 ? (
        <WelcomeBannersRail banners={banners} />
      ) : (
        promoImageUrl && (
          <div className="overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promoImageUrl} alt={promoHeadline ?? ''} className="w-full object-cover" />
          </div>
        )
      )}

      {showTiles ? (
        <div
          className={`grid gap-4 ${modes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${
            modes.length === 3 ? 'sm:grid-cols-3' : ''
          }`}
        >
          {modes.map((mode) => {
            const Icon = MODE_ICONS[mode]
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSelect(mode)}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-transparent bg-muted/60 px-4 py-7 transition-colors hover:border-primary hover:bg-muted"
                style={{ backgroundColor: theme.tileBackgroundColor ?? undefined }}
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm">
                  <Icon
                    className="h-9 w-9 text-primary"
                    strokeWidth={1.75}
                    style={{ color: theme.tileIconColor ?? undefined }}
                  />
                </span>
                <span className="text-center" style={{ color: theme.tileTextColor ?? undefined }}>
                  <span className="block text-base font-bold uppercase tracking-wide">
                    {OUTLET_MODE_LABELS[mode]}
                  </span>
                  <span className="block text-xs text-muted-foreground">{MODE_BLURBS[mode]}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartOrdering}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-6 py-6 text-lg font-bold text-primary-foreground shadow-md transition-transform active:scale-[0.98]"
          style={{
            backgroundColor: theme.ctaBackgroundColor ?? undefined,
            color: theme.ctaTextColor ?? undefined,
          }}
        >
          {resolveWelcomeCtaText(welcome)}
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </button>
      )}

      {showTiles && modes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          None of our branches are taking orders right now. Please check back shortly.
        </p>
      )}
    </div>
  )
}
