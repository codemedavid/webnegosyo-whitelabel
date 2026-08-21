'use client'

import { useEffect, useState } from 'react'
import { prefersReducedMotion } from './motion'
import { BrandButton, CheckIcon, Photo } from './landing-ui'
import {
  CHECKOUT_URL,
  DEMO_ORDER,
  DEMO_ORDER_TOTAL,
  HERO_TRUST_POINTS,
  LANDING_PHOTOS,
  PRICE_LABEL,
  PRODUCT_ONE_LINER,
  SMARTMENU,
} from './landing-theme'

const PESO = new Intl.NumberFormat('en-PH')
const PLAY_INTERVAL_MS = 900

/**
 * The hero's one authored moment: a single order plays out on the receipt.
 * The base order prints, then each upsell line joins and the total climbs —
 * the whole product argument, performed before a single word of copy.
 */
function useOrderRun() {
  const [playsLit, setPlaysLit] = useState<number>(DEMO_ORDER.plays.length)

  useEffect(() => {
    if (prefersReducedMotion()) return

    setPlaysLit(0)
    const timers = DEMO_ORDER.plays.map((_, i) =>
      window.setTimeout(() => setPlaysLit(i + 1), 700 + i * PLAY_INTERVAL_MS),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [])

  const total =
    DEMO_ORDER.base +
    DEMO_ORDER.plays.slice(0, playsLit).reduce((sum, play) => sum + play.amount, 0)

  return { playsLit, total }
}

/** A till receipt, printed in the serif of the brand. */
function ReceiptCard() {
  const { playsLit, total } = useOrderRun()

  return (
    <div
      className="w-full max-w-[340px] rotate-1 px-6 py-6 shadow-2xl"
      style={{
        backgroundColor: '#FFFDF6',
        color: SMARTMENU.ink,
        borderRadius: 6,
        boxShadow: '0 30px 60px -18px rgba(0,0,0,0.65)',
      }}
    >
      <p className="font-display text-center text-sm font-bold uppercase tracking-[0.18em]">
        Smart<span style={{ color: SMARTMENU.red }}>Menu</span> · Order #042
      </p>
      <p className="mt-1 text-center text-[10px] uppercase tracking-[0.14em] opacity-50">
        Isang order, kusang lumalaki
      </p>
      <div aria-hidden className="my-4 border-t border-dashed" style={{ borderColor: `${SMARTMENU.ink}44` }} />

      <dl className="space-y-2.5 text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold">Burger Meal</dt>
          <dd className="tabular-nums">₱{DEMO_ORDER.base}</dd>
        </div>
        {DEMO_ORDER.plays.map((play, i) => {
          const isLit = i < playsLit
          return (
            <div
              key={play.label}
              className="flex items-baseline justify-between gap-3 transition-opacity duration-500"
              style={{ opacity: isLit ? 1 : 0.22 }}
            >
              <dt className="flex items-center gap-2">
                <span
                  className="font-display rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                  style={{ backgroundColor: `${SMARTMENU.amber}33`, color: '#8A5B00' }}
                >
                  {play.label}
                </span>
                {play.detail}
              </dt>
              <dd className="tabular-nums font-semibold" style={{ color: SMARTMENU.green }}>
                +₱{play.amount}
              </dd>
            </div>
          )
        })}
      </dl>

      <div aria-hidden className="my-4 border-t border-dashed" style={{ borderColor: `${SMARTMENU.ink}44` }} />
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xs font-bold uppercase tracking-[0.16em]">Total</span>
        <span className="font-serif text-3xl font-semibold tabular-nums" style={{ color: SMARTMENU.red }}>
          ₱{PESO.format(total)}
        </span>
      </div>
      <p className="mt-3 text-center text-[10px] leading-snug opacity-60">
        Halimbawang order — ₱{DEMO_ORDER.base} na naging ₱{DEMO_ORDER_TOTAL} sa tatlong automatic na
        suggestion.
      </p>
    </div>
  )
}

/** Scattered plates around the copy — larger below, smaller on top, and a
 *  margin of safety always kept around the text. */
function ScatteredPlates() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      <div className="photo-zoom absolute -left-10 bottom-[8%] h-44 w-56 -rotate-6 overflow-hidden rounded-xl border-4 border-white/90 shadow-2xl">
        <Photo photo={LANDING_PHOTOS.burger} decorative sizes="14rem" />
      </div>
      <div className="photo-zoom absolute right-[30%] top-[6%] h-28 w-36 rotate-3 overflow-hidden rounded-xl border-4 border-white/90 shadow-xl">
        <Photo photo={LANDING_PHOTOS.plated} decorative sizes="9rem" />
      </div>
    </div>
  )
}

export function LandingHero() {
  return (
    <section
      className="noise vignette relative overflow-hidden px-5 md:px-8"
      style={{ backgroundColor: SMARTMENU.night }}
    >
      {/* The room itself: a candlelit service, darkened until the type reads. */}
      <div className="absolute inset-0">
        <Photo photo={LANDING_PHOTOS.heroTable} priority sizes="100vw" className="opacity-45" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${SMARTMENU.night}CC 0%, ${SMARTMENU.night}66 40%, ${SMARTMENU.night}E6 100%)`,
          }}
        />
      </div>

      <ScatteredPlates />

      <div className="hero-recede relative mx-auto grid max-w-6xl items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
        <div>
          <p
            className="font-display mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ backgroundColor: `${SMARTMENU.amber}26`, color: SMARTMENU.amber, border: `1px solid ${SMARTMENU.amber}55` }}
          >
            ✺ Para sa food business mo
          </p>

          <h1 className="font-display t-hero leading-[1.02] text-white" style={{ textWrap: 'balance' }}>
            Ang menu mo, dapat{' '}
            <span className="font-serif italic" style={{ color: SMARTMENU.amber }}>
              nagbebenta
            </span>{' '}
            para sa iyo.
          </h1>

          <p className="t-lead mt-6 max-w-[52ch] leading-relaxed" style={{ color: SMARTMENU.parchment }}>
            {PRODUCT_ONE_LINER}
          </p>

          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <BrandButton size="large" href={CHECKOUT_URL}>
              Kunin — {PRICE_LABEL}
            </BrandButton>
            <BrandButton size="large" tone="ghost-dark" href="#what-you-get">
              Ano ang kasama?
            </BrandButton>
          </div>

          <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            {HERO_TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em]"
                style={{ color: SMARTMENU.parchment }}
              >
                <CheckIcon color={SMARTMENU.amber} size={13} />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ReceiptCard />
        </div>
      </div>
    </section>
  )
}
