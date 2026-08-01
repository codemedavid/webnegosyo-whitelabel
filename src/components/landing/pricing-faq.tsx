'use client'

import { useState } from 'react'
import { ChalkRule, CheckMark, CourtButton, CrossMark, Lit, SectionTitle } from './court'
import { SegmentDisplay } from './segment-display'
import { COURT, EXCLUSIONS, FAQ_ITEMS, PRICE_DIGITS, PRICE_LABEL, PRICING_FEATURES } from './landing-theme'

/** The final score: one figure, in segments, at the size the board runs it. */
function FinalScore() {
  return (
    <div
      className="mx-auto mt-14 max-w-xl"
      style={{
        backgroundColor: COURT.steel,
        border: '1px solid rgba(237,232,218,0.14)',
        boxShadow: '0 34px 76px rgba(0,0,0,0.62), inset 0 1px 0 rgba(237,232,218,0.12)',
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ backgroundColor: '#070A08', borderBottom: '1px solid rgba(237,232,218,0.1)' }}
      >
        <span
          className="font-display text-xs uppercase leading-none tracking-[0.12em]"
          style={{ color: COURT.lane }}
        >
          Smart Menu System
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: COURT.laneDim }}
        >
          Final
        </span>
      </div>

      <div
        className="px-5 py-9 text-center"
        style={{ background: 'linear-gradient(180deg, #0C110E, #070A08)' }}
      >
        <div className="flex items-end justify-center">
          <SegmentDisplay
            value={`₱${PRICE_DIGITS}`}
            color={COURT.ledAmber}
            height="clamp(2.9rem, 9.5vw, 5rem)"
            label={PRICE_LABEL}
          />
        </div>
        <p
          className="mt-5 font-display text-sm uppercase tracking-[0.1em]"
          style={{ color: COURT.lane }}
        >
          One-time
        </p>
        <p className="mt-1.5 text-[13px]" style={{ color: COURT.laneDim }}>
          Lifetime access • Walang renewal
        </p>
      </div>

      <div className="px-6 pb-8 pt-2 md:px-8">
        <ul className="text-left">
          {PRICING_FEATURES.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-3 py-2.5 text-[13.5px] leading-snug"
              style={{ color: '#C6CCC5', borderBottom: '1px solid rgba(237,232,218,0.08)' }}
            >
              <CheckMark size={14} className="mt-0.5 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <CourtButton fullWidth size="large">
            Kunin ang Smart Menu
          </CourtButton>
        </div>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
          {EXCLUSIONS.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ color: COURT.laneDim }}
            >
              <CrossMark size={12} className="shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative z-10 scroll-mt-16 px-5 py-24 md:px-8 md:py-32"
      style={{ backgroundColor: COURT.groundLit }}
    >
      <div className="mx-auto max-w-4xl">
        <SectionTitle body="Walang monthly fees, walang hidden charges, walang commission kada order. Isang bayad lang — lifetime access sa buong Smart Menu system.">
          Isang bayad. <Lit>Buo ang system.</Lit>
        </SectionTitle>
        <FinalScore />
      </div>
    </section>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <ChalkRule />
      <h3>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-5 py-5 text-left"
        >
          <span
            className="font-display text-[15px] uppercase leading-snug tracking-[-0.005em] md:text-[17px]"
            style={{ color: COURT.lane }}
          >
            {q}
          </span>
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center"
            style={{
              border: `2px solid ${isOpen ? COURT.ledAmber : 'rgba(237,232,218,0.28)'}`,
              color: isOpen ? COURT.ledAmber : COURT.laneDim,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M4 12h16" strokeLinecap="square" />
              {!isOpen && <path d="M12 4v16" strokeLinecap="square" />}
            </svg>
          </span>
        </button>
      </h3>
      {isOpen && (
        <p
          className="max-w-[68ch] pb-6 pr-10 text-[14.5px] leading-relaxed"
          style={{ color: COURT.laneDim }}
        >
          {a}
        </p>
      )}
    </div>
  )
}

export function FAQSection() {
  return (
    <section id="faq" className="relative z-10 scroll-mt-16 px-5 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-3xl">
        <SectionTitle align="left">Mga madalas itanong</SectionTitle>

        <div className="mt-12">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
          <ChalkRule />
        </div>

        <div className="mt-12">
          <CourtButton>Kunin — {PRICE_LABEL}</CourtButton>
        </div>
      </div>
    </section>
  )
}
