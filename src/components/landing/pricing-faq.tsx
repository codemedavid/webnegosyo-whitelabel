'use client'

import { useState } from 'react'
import { BrandButton, CheckIcon, Eyebrow } from './landing-ui'
import {
  CHECKOUT_URL,
  EXCLUSIONS,
  FAQ_ITEMS,
  MONTHLY_PRICE_LABEL,
  PRICE_LABEL,
  PRICING_FEATURES,
  SMARTMENU,
} from './landing-theme'

/** The offer, set like a printed menu: serif price, dotted leaders, no noise. */
function MenuCard() {
  return (
    <div
      className="mx-auto mt-12 max-w-xl rounded-3xl bg-white px-7 py-10 shadow-xl md:px-10"
      style={{ border: `1px solid ${SMARTMENU.ink}14` }}
    >
      <p className="font-display text-center text-xs font-bold uppercase tracking-[0.22em]" style={{ color: SMARTMENU.cocoa }}>
        Smart Menu System
      </p>
      <div className="mt-4 flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="font-serif text-5xl font-semibold" style={{ color: SMARTMENU.ink }}>
            {PRICE_LABEL}
          </p>
          <p className="font-display mt-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.cocoa }}>
            One-time setup
          </p>
        </div>
        <span aria-hidden className="font-serif text-3xl italic" style={{ color: SMARTMENU.amber }}>
          +
        </span>
        <div className="text-center">
          <p className="font-serif text-5xl font-semibold" style={{ color: SMARTMENU.red }}>
            {MONTHLY_PRICE_LABEL}
            <span className="text-2xl">/buwan</span>
          </p>
          <p className="font-display mt-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.cocoa }}>
            Buong system, lahat kasama
          </p>
        </div>
      </div>
      <p className="mt-3 text-center text-[13px]" style={{ color: SMARTMENU.cocoa }}>
        Walang commission kada order • Cancel anytime
      </p>

      <div aria-hidden className="my-7 border-t border-dashed" style={{ borderColor: `${SMARTMENU.ink}33` }} />

      <ul className="text-left">
        {PRICING_FEATURES.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-3 py-2.5 text-[13.5px] leading-snug"
            style={{ color: SMARTMENU.ink, borderBottom: `1px dashed ${SMARTMENU.ink}1A` }}
          >
            <span className="mt-0.5">
              <CheckIcon size={14} />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-stretch">
        <BrandButton size="large" href={CHECKOUT_URL}>
          Kunin ang Smart Menu
        </BrandButton>
      </div>

      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
        {EXCLUSIONS.map((item) => (
          <li
            key={item}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] line-through decoration-2"
            style={{ color: SMARTMENU.cocoa, textDecorationColor: SMARTMENU.red, opacity: 0.75 }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.creamDeep }}
    >
      <div className="rise mx-auto max-w-4xl text-center">
        <h2 className="font-display t-display mx-auto max-w-[22ch] leading-tight" style={{ color: SMARTMENU.ink }}>
          Isang plan.{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.red }}>
            Buo ang system.
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-[56ch] text-sm leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
          Walang hidden charges, walang commission kada order. {PRICE_LABEL} one-time setup, tapos{' '}
          {MONTHLY_PRICE_LABEL} kada buwan para sa buong Smart Menu system — website, POS, inventory,
          SMS marketing, at AI analytics.
        </p>
        <MenuCard />
      </div>
    </section>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div style={{ borderBottom: `1px dashed ${SMARTMENU.ink}26` }}>
      <h3>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-5 py-5 text-left"
        >
          <span className="font-display text-[15px] font-bold leading-snug md:text-[17px]" style={{ color: SMARTMENU.ink }}>
            {q}
          </span>
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{
              border: `2px solid ${isOpen ? SMARTMENU.red : `${SMARTMENU.ink}33`}`,
              color: isOpen ? SMARTMENU.red : SMARTMENU.cocoa,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M4 12h16" strokeLinecap="round" />
              {!isOpen && <path d="M12 4v16" strokeLinecap="round" />}
            </svg>
          </span>
        </button>
      </h3>
      {isOpen && (
        <p className="max-w-[68ch] pb-6 pr-10 text-[14.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
          {a}
        </p>
      )}
    </div>
  )
}

export function FAQSection() {
  return (
    <section
      id="faq"
      className="scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.cream }}
    >
      <div className="rise mx-auto max-w-3xl">
        <Eyebrow>Mga madalas itanong</Eyebrow>
        <h2 className="font-display t-display leading-tight" style={{ color: SMARTMENU.ink }}>
          May{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.red }}>
            tanong?
          </span>
        </h2>

        <div className="mt-10" style={{ borderTop: `1px dashed ${SMARTMENU.ink}26` }}>
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        <div className="mt-12">
          <BrandButton href={CHECKOUT_URL}>Kunin — {PRICE_LABEL}</BrandButton>
        </div>
      </div>
    </section>
  )
}
