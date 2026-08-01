'use client'

import { useEffect, useState } from 'react'
import { CheckMark, CourtButton } from './court'
import { prefersReducedMotion } from './motion'
import { SegmentDisplay } from './segment-display'
import {
  COURT,
  DEMO_ORDER,
  DEMO_ORDER_TOTAL,
  HERO_TRUST_POINTS,
  PRICE_LABEL,
  PRODUCT_ONE_LINER,
} from './landing-theme'

const PESO = new Intl.NumberFormat('en-PH')
const PLAY_INTERVAL_MS = 900

/**
 * The board's one authored moment: the order is played out once. The base
 * order lands, then each upsell lights and the figure climbs. The whole
 * product argument, performed before a single word of copy.
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

function RailLabel({
  children,
  color = COURT.laneDim,
}: {
  children: React.ReactNode
  color?: string
}) {
  return (
    <span className="text-[10px] font-bold uppercase leading-none tracking-[0.2em]" style={{ color }}>
      {children}
    </span>
  )
}

function ScoreColumn({
  side,
  name,
  value,
  color,
  note,
}: {
  side: string
  name: string
  value: string
  color: string
  note: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center px-3 py-4 text-center md:px-5 md:py-7">
      <RailLabel>{side}</RailLabel>
      <p
        className="mt-2 font-display text-[13px] uppercase leading-none tracking-[0.06em] md:text-base"
        style={{ color: COURT.lane }}
      >
        {name}
      </p>
      <div className="mt-4 flex items-end justify-center md:mt-5">
        <SegmentDisplay
          value={value}
          color={color}
          height="clamp(2.6rem, 10vw, 4.5rem)"
          label={`₱${value}`}
        />
      </div>
      <p className="mt-4 text-[11px] leading-snug" style={{ color: COURT.laneDim }}>
        {note}
      </p>
    </div>
  )
}

function Scoreboard() {
  const { playsLit, total } = useOrderRun()

  return (
    <div
      className="relative w-full max-w-[560px]"
      style={{
        backgroundColor: COURT.steel,
        boxShadow:
          '0 34px 70px rgba(0,0,0,0.62), inset 0 1px 0 rgba(237,232,218,0.12), inset 0 -2px 0 rgba(0,0,0,0.5)',
        border: '1px solid rgba(237,232,218,0.1)',
      }}
    >
      <div
        className="flex items-center justify-between gap-4 px-4 py-2.5"
        style={{ backgroundColor: '#070A08', borderBottom: '1px solid rgba(237,232,218,0.09)' }}
      >
        <RailLabel>Isang order</RailLabel>
        <span className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: COURT.ledGreen, boxShadow: `0 0 7px ${COURT.ledGreen}` }}
          />
          <RailLabel color={COURT.ledGreen}>Smart Menu on</RailLabel>
        </span>
      </div>

      <div
        className="flex items-stretch"
        style={{ background: 'linear-gradient(180deg, #0C110E, #070A08)' }}
      >
        <ScoreColumn
          side="Home"
          name="Menu mo"
          value={PESO.format(total)}
          color={COURT.ledGreen}
          note="Sa link mo, sa presyo mo"
        />
        <div aria-hidden style={{ width: 1, backgroundColor: 'rgba(237,232,218,0.1)' }} />
        <ScoreColumn
          side="Away"
          name="Komisyon"
          value="0"
          color={COURT.ledRed}
          note="Walang kinukuha kahit ilang order"
        />
      </div>

      {/* The plays. Each lamp fires as its upsell joins the running order. */}
      <div
        className="grid grid-cols-3 gap-px"
        style={{
          backgroundColor: 'rgba(237,232,218,0.1)',
          borderTop: '1px solid rgba(237,232,218,0.1)',
        }}
      >
        {DEMO_ORDER.plays.map((play, i) => {
          const isLit = i < playsLit
          return (
            <div
              key={play.label}
              className="flex flex-col items-center gap-1.5 px-2 py-3.5 transition-colors duration-500"
              style={{ backgroundColor: isLit ? '#141B16' : '#080B09' }}
            >
              <span
                className="h-2 w-2 rounded-full transition-all duration-500"
                style={{
                  backgroundColor: isLit ? COURT.ledAmber : 'rgba(237,232,218,0.13)',
                  boxShadow: isLit ? `0 0 10px ${COURT.ledAmber}` : 'none',
                }}
              />
              <span
                className="font-display text-[11px] uppercase leading-none tracking-[0.1em] transition-colors duration-500 md:text-xs"
                style={{ color: isLit ? COURT.lane : 'rgba(237,232,218,0.32)' }}
              >
                {play.label}
              </span>
              <span
                className="text-[11px] font-bold leading-none transition-colors duration-500"
                style={{ color: isLit ? COURT.ledAmber : 'rgba(237,232,218,0.22)' }}
              >
                +₱{play.amount}
              </span>
            </div>
          )
        })}
      </div>

      <p
        className="px-4 py-2.5 text-center text-[10px] leading-snug"
        style={{ color: COURT.laneDim, backgroundColor: '#070A08' }}
      >
        Halimbawang order — ₱{DEMO_ORDER.base} na naging ₱{DEMO_ORDER_TOTAL} sa tatlong automatic na
        suggestion.
      </p>
    </div>
  )
}

export function LandingHero() {
  return (
    <section className="landing-hero-section relative overflow-hidden px-5 md:px-8">
      {/* Floodlight pool and the painted centre arc — the court, drawn in CSS. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 88% 60% at 50% 18%, #18211C 0%, #121915 42%, transparent 76%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[62%] hidden h-[520px] w-[940px] -translate-x-1/2 rounded-[50%] border-[3px] lg:block"
        style={{ borderColor: 'rgba(237,232,218,0.17)', filter: 'blur(0.5px)' }}
      />

      <div className="landing-hero-grid relative mx-auto grid max-w-6xl items-center gap-12 lg:gap-16">
        {/* The board leads: first in the document, so on a phone it is the
            first thing on the screen. The desktop grid puts it back on the
            right without depending on an order utility. */}
        <div className="landing-hero-board flex justify-center">
          <Scoreboard />
        </div>

        <div className="landing-hero-copy">
          <h1
            className="font-display t-hero uppercase leading-[0.88] tracking-[-0.03em]"
            style={{ color: COURT.lane, textWrap: 'balance' }}
          >
            Ang menu mo, <span style={{ color: COURT.ledAmber }}>dapat nagbebenta</span> para sa iyo.
          </h1>

          <p
            className="mt-6 max-w-[52ch] t-lead leading-relaxed"
            style={{ color: COURT.laneDim }}
          >
            {PRODUCT_ONE_LINER}
          </p>

          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <CourtButton size="large">Kunin — {PRICE_LABEL}</CourtButton>
            <CourtButton size="large" tone="chalk" href="#what-you-get">
              Ano ang kasama?
            </CourtButton>
          </div>

          <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            {HERO_TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em]"
                style={{ color: COURT.laneDim }}
              >
                <CheckMark size={13} className="shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
