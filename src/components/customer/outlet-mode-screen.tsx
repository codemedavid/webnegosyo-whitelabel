'use client'

import { ArrowRight, Bike, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { WelcomeBannerSlideshow } from '@/components/customer/welcome-banner-slideshow'
import {
  normalizeWelcomeBanners,
  resolveWelcomeCtaText,
  resolveWelcomeTextAlign,
  resolveWelcomeTheme,
  shouldShowOrderTypeStep,
  shouldShowWelcomeCopy,
  shouldShowWelcomeHeader,
  shouldShowWelcomeLogo,
  type WelcomeTenantFields,
} from '@/lib/outlets/welcome-page'
import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'
import { OUTLET_MODE_LABELS } from '@/lib/outlets/outlet-modes'
import { WelcomeStoreHeader } from '@/components/customer/welcome-store-header'
import type { Tenant } from '@/types/database'

interface OutletModeScreenProps {
  tenantName: string
  /** Full tenant row — feeds the branded store header when it is switched on. */
  tenant?: Tenant | null
  /** Store logo, shown above the heading when the merchant switches it on. */
  logoUrl?: string | null
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
  tenant,
  logoUrl,
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
  const isCentered = resolveWelcomeTextAlign(welcome) === 'center'
  const showStoreHeader = shouldShowWelcomeHeader(welcome)
  const showLogo = shouldShowWelcomeLogo(welcome)
  const showCopy = shouldShowWelcomeCopy(welcome)

  // Deliberately NOT falling back to the flash-screen headline: that field is
  // written for a loading splash ("Loading menu...") and reads as a broken page
  // when it greets the customer.
  const heading = welcome?.welcome_heading_text?.trim() || `Welcome to ${tenantName}`
  const subheading =
    welcome?.welcome_subheading_text?.trim() ||
    (showTiles ? 'How would you like your order?' : 'Find the branch nearest you')

  return (
    <div
      className="flex min-h-full w-full flex-col gap-6 px-5 py-7"
      style={{ backgroundColor: theme.backgroundColor ?? undefined }}
    >
      {showStoreHeader && <WelcomeStoreHeader tenant={tenant ?? null} />}

      {(showLogo || showCopy) && (
        <div
          data-testid="welcome-header"
          className={isCentered ? 'flex flex-col items-center text-center' : undefined}
        >
          {showLogo && logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt={tenantName}
              className={`h-20 w-auto max-w-[60%] object-contain ${showCopy ? 'mb-4' : ''}`}
            />
          )}
          {showCopy && (
            <>
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{ color: theme.headingColor ?? undefined }}
              >
                {heading}
              </h1>
              <p
                className="mt-1 text-muted-foreground"
                style={{ color: theme.subtextColor ?? undefined }}
              >
                {subheading}
              </p>
            </>
          )}
        </div>
      )}

      {/* The reason we are asking again is not branding copy — it survives
          every header switch, or the customer is left guessing. */}
      {message && (
        <p className={`text-sm text-amber-600 ${isCentered ? 'text-center' : ''}`}>{message}</p>
      )}

      {banners.length > 0 ? (
        <WelcomeBannerSlideshow banners={banners} />
      ) : (
        promoImageUrl && (
          <div className="overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promoImageUrl} alt={promoHeadline ?? ''} className="w-full object-cover" />
          </div>
        )
      )}

      {showTiles ? (
        // Wrapping flex rather than a grid: with three modes on a narrow screen
        // the odd tile lands centred under the other two instead of hugging the
        // left edge, and from `sm` up all three sit on one row.
        <div className="flex flex-wrap justify-center gap-2.5" data-testid="welcome-mode-tiles">
          {modes.map((mode) => {
            const Icon = MODE_ICONS[mode]
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSelect(mode)}
                className={`group flex flex-col items-center gap-2 rounded-2xl border-2 border-transparent bg-muted/60 px-2 py-4 transition-colors hover:border-primary hover:bg-muted ${
                  modes.length === 1 ? 'basis-full' : 'basis-[calc(33.333%-0.55rem)]'
                }`}
                style={{ backgroundColor: theme.tileBackgroundColor ?? undefined }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
                  <Icon
                    className="h-6 w-6 text-primary"
                    strokeWidth={1.75}
                    style={{ color: theme.tileIconColor ?? undefined }}
                  />
                </span>
                <span className="text-center" style={{ color: theme.tileTextColor ?? undefined }}>
                  <span className="block text-[13px] font-bold uppercase tracking-wide">
                    {OUTLET_MODE_LABELS[mode]}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{MODE_BLURBS[mode]}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartOrdering}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-md transition-transform active:scale-[0.98]"
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
