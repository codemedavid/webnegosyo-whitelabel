'use client'

import Link from 'next/link'
import { ArrowRight, ChevronRight, CreditCard, Hand, Bike, Zap, type LucideIcon } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { AddButton, CardTitleButton, Price } from '@/components/customer/card-templates/flex/card-kit'
import type { MenuItem, PromotionBanner } from '@/types/database'
import { useStorefrontRuntime } from '../../runtime/storefront-runtime'
import { BITESPEED_CARD_SHADOW, SectionHeading, itemPricing, useBiteSpeedRoutes, useHideCurrencySymbol } from './parts'
import type { BiteSpeedSettings } from './settings'

const DEFAULT_HERO_TITLE = 'Craving something'
const DEFAULT_HERO_HIGHLIGHT = 'delicious?'
const DEFAULT_HERO_DESCRIPTION = 'Choose your favorites and order in a few taps. Hot, fresh and made for you.'
const DEFAULT_HERO_CTA = 'Order now'
const DISPLAY = { fontFamily: 'var(--bs-font-display)' } as const

/** Full-bleed hero: photo, kicker, two-line headline and the order button. */
export function BiteSpeedHero({ settings, fallbackImage }: { settings: BiteSpeedSettings; fallbackImage?: string | null }) {
  const { tenant } = useStorefrontRuntime().menu
  const routes = useBiteSpeedRoutes()
  const customTitle = tenant?.hero_title?.trim()
  const title = customTitle || DEFAULT_HERO_TITLE
  // The accent line only defaults while the title does too, so a merchant's
  // own headline is never extended with words they did not write.
  const highlight = settings.hero_highlight || (customTitle ? '' : DEFAULT_HERO_HIGHLIGHT)
  const image = tenant?.hero_image_url || fallbackImage

  return (
    <section data-branding-scope="storefront/hero" className="relative flex min-h-[530px] w-full items-center overflow-hidden py-12 md:rounded-b-[calc(var(--bs-radius)*1.5)]">
      {image ? (
        <OptimizedImage src={image} alt="" fill priority sizes="100vw" className="object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[var(--bs-accent)]" aria-hidden />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" aria-hidden />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 md:px-6">
        {tenant?.hero_kicker && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bs-hero-accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.05em] text-[var(--bs-on-hero-accent)]">
            <Zap className="h-4 w-4" aria-hidden />
            {tenant.hero_kicker}
          </span>
        )}
        <h1 className="max-w-2xl text-[40px] font-bold leading-[48px] tracking-[-0.02em] text-white md:text-5xl md:leading-[56px]" style={DISPLAY}>
          {title}
          {highlight && (
            <>
              <br />
              <span className="text-[var(--bs-hero-accent)]">{highlight}</span>
            </>
          )}
        </h1>
        <p className="max-w-xl text-lg leading-7 text-white/85">{tenant?.hero_description || DEFAULT_HERO_DESCRIPTION}</p>
        <Link
          href={routes.menu}
          className="inline-flex h-14 items-center gap-2 rounded-full bg-[var(--bs-hero-accent)] px-8 text-sm font-bold uppercase tracking-[0.08em] text-[var(--bs-on-hero-accent)] shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
        >
          {tenant?.hero_cta_primary_label || DEFAULT_HERO_CTA}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

function PromoTile({ banner, isWide }: { banner: PromotionBanner; isWide: boolean }) {
  const routes = useBiteSpeedRoutes()
  return (
    <Link
      href={routes.menu}
      className={`group relative block h-64 overflow-hidden rounded-[var(--bs-radius)] bg-[var(--bs-accent)] shadow-sm ${isWide ? 'md:col-span-2' : ''}`}
    >
      {banner.imageUrl && (
        <OptimizedImage src={banner.imageUrl} alt="" fill sizes="(min-width: 768px) 66vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" aria-hidden />
      <div className="relative z-10 flex h-full flex-col justify-end gap-1 p-6 text-white">
        {banner.title && <h2 className="text-2xl font-bold leading-8" style={DISPLAY}>{banner.title}</h2>}
        {banner.description && <p className="max-w-md text-sm text-white/85">{banner.description}</p>}
        <span className="mt-2 inline-flex items-center gap-0.5 text-sm font-bold">
          Order now <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  )
}

/** Up to two promotion banners as tiles: a wide one and a narrow one. */
export function BiteSpeedPromoTiles() {
  const { tenant } = useStorefrontRuntime().menu
  const banners = (tenant?.promotion_banners ?? []).filter((banner) => banner.imageUrl || banner.title).slice(0, 2)
  if (!tenant?.is_promotion_visible || banners.length === 0) return null
  return (
    <section aria-label="Deals" className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 md:grid-cols-3 md:px-6">
      {banners.map((banner, index) => (
        <PromoTile key={banner.id} banner={banner} isWide={index === 0 && banners.length > 1} />
      ))}
    </section>
  )
}

function BestSellerCard({ item }: { item: MenuItem }) {
  const { menu } = useStorefrontRuntime()
  const hideCurrencySymbol = useHideCurrencySymbol()
  const { price, compareAt, hasOptions } = itemPricing(item)
  return (
    <article
      className="relative flex min-w-[280px] snap-start flex-col rounded-[var(--bs-radius)] bg-[var(--bs-surface)] p-4 md:min-w-[320px]"
      style={{ boxShadow: BITESPEED_CARD_SHADOW }}
    >
      <div className="relative mb-4 h-48 w-full overflow-hidden rounded-[var(--bs-radius)] bg-[var(--bs-surface-high)]">
        {item.image_url && <OptimizedImage src={item.image_url} alt={item.name} fill sizes="320px" className="object-cover" />}
      </div>
      <div className="mb-1 flex items-start justify-between gap-3">
        <CardTitleButton item={item} onSelect={menu.selectItem} className="line-clamp-1 text-xl font-semibold leading-7" style={DISPLAY} />
        <Price price={price} compareAt={compareAt} hasOptions={hasOptions} hideCurrencySymbol={hideCurrencySymbol}
          color="var(--bs-accent-ink)" mutedColor="var(--bs-text-muted)" className="whitespace-nowrap text-xl font-semibold" />
      </div>
      {item.description && <p className="mb-4 line-clamp-2 flex-1 text-sm text-[var(--bs-text-muted)]">{item.description}</p>}
      <div className="mt-auto flex justify-end">
        <AddButton item={item} variant="icon" isOrderable onSelect={menu.selectItem}
          background="var(--bs-accent)" color="var(--bs-on-accent)" className="h-11 w-11" />
      </div>
    </article>
  )
}

/** A swipeable row of the tenant's best sellers. */
export function BiteSpeedBestSellers({ items, settings }: { items: MenuItem[]; settings: BiteSpeedSettings }) {
  const routes = useBiteSpeedRoutes()
  if (items.length === 0) return null
  return (
    <section aria-labelledby="bs-best-sellers" className="mx-auto w-full max-w-7xl">
      <div className="px-4 md:px-6" id="bs-best-sellers">
        <SectionHeading
          title={settings.best_sellers_title}
          subtitle={settings.best_sellers_subtitle}
          action={
            <Link href={routes.menu} className="inline-flex shrink-0 items-center gap-1 text-lg font-semibold text-[var(--bs-accent-ink)] hover:text-[var(--bs-accent)]" style={DISPLAY}>
              See all <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      </div>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-6 pt-2 md:scroll-px-6 md:px-6 [scrollbar-width:none]">
        {items.map((item) => <BestSellerCard key={item.id} item={item} />)}
      </div>
    </section>
  )
}

const STEP_ICONS: LucideIcon[] = [Hand, CreditCard, Bike]

/** Three numbered steps: how ordering here works. */
export function BiteSpeedHowItWorks({ settings }: { settings: BiteSpeedSettings }) {
  if (!settings.show_how_it_works) return null
  const steps = [
    { title: settings.step_1_title, body: settings.step_1_body },
    { title: settings.step_2_title, body: settings.step_2_body },
    { title: settings.step_3_title, body: settings.step_3_body },
  ]
  return (
    <section className="mx-4 rounded-[var(--bs-radius)] border border-[var(--bs-surface-high)] bg-[var(--bs-surface-low)] px-4 py-8 shadow-sm md:mx-auto md:w-full md:max-w-7xl md:px-6">
      <div className="mb-8 text-center">
        <h2 className="text-[28px] font-bold leading-9 md:text-[32px] md:leading-10" style={DISPLAY}>{settings.how_it_works_title}</h2>
        <p className="mt-1 text-[var(--bs-text-muted)]">{settings.how_it_works_subtitle}</p>
      </div>
      <ol className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = STEP_ICONS[index]
          return (
            <li key={index} className="flex flex-col items-center text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--bs-accent)] bg-[var(--bs-surface)] shadow-sm">
                <Icon className="h-7 w-7 text-[var(--bs-accent)]" aria-hidden />
              </span>
              <h3 className="mb-1 text-xl font-semibold" style={DISPLAY}>{step.title}</h3>
              <p className="max-w-xs text-sm text-[var(--bs-text-muted)]">{step.body}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
