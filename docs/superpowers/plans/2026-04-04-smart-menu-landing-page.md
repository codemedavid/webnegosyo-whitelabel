# Smart Menu Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 1,536-line landing page with a simplified, conversion-focused sales funnel — Acquisition.com-style dark hero + streamlined TSL with direct-to-checkout CTAs.

**Architecture:** Complete rewrite of `src/components/landing/landing-page.tsx`. Same file, same export, same `'use client'` directive. Uses framer-motion for scroll animations (already a dependency). Removes BookingPopup import and all booking-call references. All CTAs link to `/checkout`.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS, framer-motion, Lucide icons

---

### Task 1: Update root page metadata

**Files:**
- Modify: `src/app/page.tsx:10-22`

- [ ] **Step 1: Update metadata to match new theme**

Change the title, description, and OpenGraph metadata to reflect "You Can Sell More With Smart Menu" theme and P3,899 pricing:

```tsx
export const metadata: Metadata = {
  title: 'WebNegosyo - You Can Sell More With Smart Menu',
  description: 'Smart Menu System na nag-a-automate ng upsells, bundles, at upgrades para sa food businesses. One-time ₱3,899.',
  keywords: ['smart menu', 'restaurant menu engineering', 'upsell system', 'food business Philippines', 'online ordering', 'bundle system', 'average order value'],
  openGraph: {
    title: 'WebNegosyo - You Can Sell More With Smart Menu',
    description: 'Smart Menu System na nag-a-automate ng upsells, bundles, at upgrades para sa food businesses.',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update landing page metadata for Smart Menu theme"
```

---

### Task 2: Write the new landing page — constants and shared components

**Files:**
- Modify: `src/components/landing/landing-page.tsx` (full rewrite, lines 1-1536)

This task rewrites the top of the file: imports, constants, and small reusable components (CTAButton, Navigation). The existing file is 1,536 lines — we replace the entire content.

- [ ] **Step 1: Write the imports, constants, and shared sub-components**

Replace the entire file content with the new landing page. Start with imports, constants, and the small reusable pieces:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Menu,
  ShoppingCart,
  TrendingDown,
  DollarSign,
  X,
  Utensils,
  ArrowUpRight,
  BarChart3,
  Target,
} from 'lucide-react'

const CHECKOUT_URL = '/checkout'
const BRAND_PURPLE = '#7c3aed'
const DARK_BG = '#0a0a0a'
const HERO_BG = '#0F0B1A'
const ALT_BG = '#111111'
const VIEWPORT = { once: true, amount: 0.2 } as const

const NAV_LINKS = [
  { label: 'Problem', href: '#problem' },
  { label: 'Solution', href: '#solution' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const

const PAIN_POINTS = [
  {
    icon: ShoppingCart,
    title: 'Ordering Friction',
    text: 'Ang daming steps, walang guidance. Nag-ba-browse lang ang customer, naco-confuse, at nag-o-order ng pinaka-obvious. Tapos umalis na.',
  },
  {
    icon: TrendingDown,
    title: 'No Upsell System',
    text: 'Walang nag-su-suggest ng upgrade, walang "add drinks?" prompt, walang "make it a meal?" Bawat order — bare minimum lang.',
  },
  {
    icon: DollarSign,
    title: 'Margin Gets Buried',
    text: 'Ang best items mo at bundles, nakatago sa baba ng menu. Hindi napapansin kasi pare-pareho lang ang presentation.',
  },
] as const

const SOLUTION_FEATURES = [
  {
    icon: Utensils,
    title: 'Smart Bundles & Combos',
    text: '"Make it a meal?" — automatic bundle prompts na nagpapataas ng basket size. Customer feels like may deal, ikaw naman kumikita pa rin.',
  },
  {
    icon: ArrowUpRight,
    title: 'Upgrade Pairs',
    text: 'Side-by-side comparison ng ala carte vs. upgrade. Nakikita agad ng customer ang value difference — at 40%+ ang nag-u-upgrade.',
  },
  {
    icon: ShoppingCart,
    title: 'Checkout Upsells',
    text: '"Before you go..." — last-minute suggestions bago mag-checkout. Hindi nakakainis, pero napaka-effective sa dagdag na items.',
  },
  {
    icon: Target,
    title: 'Menu Engineering',
    text: 'Alam mo na kung alin ang star items, hidden gems, at slow movers. I-push ang tama, i-hide ang hindi — data-driven ang menu mo.',
  },
] as const

const SOCIAL_PROOF_STATS = [
  { value: '100', suffix: '+', label: 'Restaurant funnels observed' },
  { value: '10,000', suffix: '+', label: 'Customer orders processed' },
  { value: '3', suffix: 'x', label: 'Average order value increase' },
] as const

const PRICING_FEATURES = [
  'Smart Bundles & Combo System',
  'Upgrade Pairs Engine',
  'Checkout Upsell Prompts',
  'Menu Engineering Dashboard',
  '12 Menu Card Templates',
  '6 Page Layouts',
  'Custom Hero Designer',
  'Dine-in, Pick-up & Delivery',
  'Mobile-First Ordering Flow',
  'Lifetime Updates',
] as const

const FAQ_ITEMS = [
  {
    q: 'Kailangan ko ba ng technical skills?',
    a: 'Hindi. Lahat ng setup, kami ang gagawa. Ikaw, mag-manage lang ng orders at menu items. Parang Facebook lang ang admin dashboard.',
  },
  {
    q: 'Pang-dine-in lang ba ito?',
    a: 'Hindi — gumagana ang Smart Menu para sa dine-in, pick-up, at delivery. Lahat ng upsell features, nandoon sa lahat ng order type.',
  },
  {
    q: 'May monthly fee ba?',
    a: 'Wala. One-time payment lang ang ₱3,899. Kasama na ang lifetime updates at lahat ng features.',
  },
  {
    q: 'Gaano kabilis ma-setup?',
    a: 'Within 48 hours after payment, live na ang Smart Menu mo. We handle the technical setup para sa iyo.',
  },
  {
    q: 'Paano kung hindi gumana sa business ko?',
    a: 'Every food business na may menu — gumana ang Smart Menu. Bundles, upgrades, at upsells work across cuisines and order types.',
  },
] as const

/* ====================================================================
 * Shared sub-components
 * ==================================================================== */

function CTAButton({
  children,
  size = 'default',
  fullWidth = false,
  className = '',
}: {
  children: React.ReactNode
  size?: 'default' | 'large'
  fullWidth?: boolean
  className?: string
}) {
  const sizeClasses =
    size === 'large'
      ? 'px-14 py-5 text-lg'
      : 'px-10 py-4 text-[15px]'

  return (
    <Link
      href={CHECKOUT_URL}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl font-extrabold uppercase tracking-[0.06em] text-white transition-transform duration-200 hover:-translate-y-0.5 ${sizeClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{
        background: `linear-gradient(135deg, ${BRAND_PURPLE}, #6d28d9)`,
        boxShadow: `0 8px 30px rgba(124, 58, 237, 0.3)`,
      }}
    >
      {children}
      <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  )
}

function CTAStrip({
  children,
  subText,
}: {
  children: React.ReactNode
  subText: string
}) {
  return (
    <div
      className="py-12 text-center"
      style={{
        backgroundColor: HERO_BG,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <CTAButton>{children}</CTAButton>
      <p className="mt-3 text-xs text-white/30">{subText}</p>
    </div>
  )
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-3 inline-block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: BRAND_PURPLE }}>
      {children}
    </span>
  )
}

function Navigation() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-white/6"
      style={{ backgroundColor: `${DARK_BG}e6`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" className="text-base font-black text-white tracking-[-0.02em]">
          Web<span style={{ color: BRAND_PURPLE }}>Negosyo</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] text-white/50 transition-colors duration-200 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href={CHECKOUT_URL}
          className="hidden rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-[0.06em] text-white md:inline-block"
          style={{ backgroundColor: BRAND_PURPLE }}
        >
          Get Smart Menu
        </Link>

        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white md:hidden"
          aria-expanded={isOpen}
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-white/10 md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm text-white/80 hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href={CHECKOUT_URL}
                onClick={() => setIsOpen(false)}
                className="mt-2 rounded-lg px-5 py-3 text-center text-sm font-bold uppercase text-white"
                style={{ backgroundColor: BRAND_PURPLE }}
              >
                Get Smart Menu
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
```

Do NOT save the file yet — continue to the next steps to add the remaining sections, then save everything at once in Task 3.

- [ ] **Step 2: Commit placeholder** — skip, we save the full file in Task 3.

---

### Task 3: Write the new landing page — section components and main export

**Files:**
- Modify: `src/components/landing/landing-page.tsx` (continuation from Task 2)

- [ ] **Step 1: Add all section components and the main LandingPage export**

Append these after the Navigation component from Task 2 (all in the same file). This includes HeroSection, ProblemSection, SolutionSection, SocialProofSection, PricingSection, FAQSection, FinalCTASection, Footer, and the main `LandingPage` export:

```tsx
/* ====================================================================
 * Section 1: Hero
 * ==================================================================== */

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden pb-20 pt-32 md:pb-24 md:pt-40"
      style={{ backgroundColor: HERO_BG }}
    >
      {/* Glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${BRAND_PURPLE}2e` }}
      />
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Bottom fade */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{ background: `linear-gradient(180deg, transparent, ${HERO_BG})` }}
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        {/* Pill badge */}
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2">
          <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
            Smart Menu System &bull; Para sa Food Business Owners
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[clamp(2.5rem,8vw,5rem)] font-black uppercase leading-[0.95] tracking-[-0.05em] text-white">
          You Can Sell More
          <br />
          With Smart Menu
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-5 max-w-xl text-[clamp(0.95rem,2vw,1.2rem)] leading-relaxed text-white/55">
          Hindi sapat na maganda lang ang menu mo. Kailangan nitong mag-guide,
          mag-suggest, at mag-push ng bigger orders — automatically.
        </p>

        {/* Video placeholder */}
        <div className="relative mx-auto mt-8 w-full max-w-[580px] overflow-hidden rounded-2xl border border-white/8" style={{ aspectRatio: '16/9', backgroundColor: '#1a1528' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: `${BRAND_PURPLE}e6`, boxShadow: `0 0 30px ${BRAND_PURPLE}66` }}
            >
              <div className="ml-1 h-0 w-0 border-y-[13px] border-l-[22px] border-y-transparent border-l-white" />
            </div>
          </div>
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-[11px] text-white/60">
            See how Smart Menu works
          </div>
        </div>

        {/* Supporting copy */}
        <p className="mx-auto mt-7 max-w-lg text-sm leading-relaxed text-white/40">
          Isang system na nag-a-automate ng upsells, bundles, at upgrades — para
          every order, mas malaki ang value.
        </p>

        {/* CTA */}
        <div className="mt-7">
          <CTAButton size="large">Get Smart Menu Now — ₱3,899</CTAButton>
        </div>
        <p className="mt-3 text-[11px] text-white/30">
          One-time payment &bull; No monthly fees &bull; Lifetime access
        </p>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 2: Problem
 * ==================================================================== */

function ProblemSection() {
  return (
    <section id="problem" className="py-20 md:py-28" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
        >
          <SectionTag>The Problem</SectionTag>
          <h2 className="text-[clamp(1.75rem,5vw,2.6rem)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white">
            Your Menu Is Leaving
            <br />
            Money on the Table
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/50">
            Karamihan ng food businesses, ganito ang nangyayari sa online ordering
            nila — at hindi nila alam kung magkano ang nawawala.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PAIN_POINTS.map((point, i) => {
            const Icon = point.icon
            return (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-7"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10">
                  <Icon className="h-5 w-5 text-red-400" />
                </div>
                <h3 className="text-[17px] font-extrabold text-white">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{point.text}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 3: Solution
 * ==================================================================== */

function SolutionSection() {
  return (
    <section id="solution" className="py-20 md:py-28" style={{ backgroundColor: ALT_BG }}>
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
        >
          <SectionTag>The Solution</SectionTag>
          <h2 className="text-[clamp(1.75rem,5vw,2.6rem)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white">
            Smart Menu Does the
            <br />
            Selling for You
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/50">
            Every feature is designed para tumaas ang average order value —
            without being pushy. Parang invisible na salesperson sa bawat order.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {SOLUTION_FEATURES.map((feat, i) => {
            const Icon = feat.icon
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="rounded-2xl border border-purple-500/15 bg-purple-500/[0.04] p-7"
              >
                <div
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${BRAND_PURPLE}26` }}
                >
                  <Icon className="h-5 w-5" style={{ color: BRAND_PURPLE }} />
                </div>
                <h3 className="text-[17px] font-extrabold text-white">{feat.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{feat.text}</p>
                <span
                  className="mt-3 inline-block rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{ backgroundColor: `${BRAND_PURPLE}1a`, color: BRAND_PURPLE }}
                >
                  Dine-in &bull; Pick-up &bull; Delivery
                </span>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 4: Social Proof
 * ==================================================================== */

function SocialProofSection() {
  return (
    <section className="py-20 text-center md:py-28" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
        >
          <SectionTag>Trusted by Restaurant Owners</SectionTag>
          <h2 className="text-[clamp(1.75rem,5vw,2.6rem)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white">
            The Numbers
            <br />
            Speak for Themselves
          </h2>
        </motion.div>

        <div className="mt-12 flex flex-wrap items-start justify-center gap-12 md:gap-16">
          {SOCIAL_PROOF_STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-[clamp(2.5rem,6vw,3.2rem)] font-black tracking-[-0.03em] text-white">
                {stat.value}
                <span style={{ color: BRAND_PURPLE }}>{stat.suffix}</span>
              </div>
              <div className="mt-1 text-[13px] text-white/40">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 5: Pricing
 * ==================================================================== */

function PricingSection() {
  return (
    <section id="pricing" className="py-20 text-center md:py-28" style={{ backgroundColor: ALT_BG }}>
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
        >
          <SectionTag>Simple Pricing</SectionTag>
          <h2 className="text-[clamp(1.75rem,5vw,2.6rem)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white">
            One Price.
            <br />
            Everything Included.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/50">
            Walang monthly fees, walang hidden charges. Isang bayad lang —
            lifetime access sa buong Smart Menu system.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-12 max-w-md rounded-3xl border-2 p-10"
          style={{
            borderColor: `${BRAND_PURPLE}40`,
            background: `linear-gradient(145deg, ${BRAND_PURPLE}14, ${BRAND_PURPLE}08)`,
          }}
        >
          <div
            className="text-[13px] font-bold uppercase tracking-[0.1em]"
            style={{ color: BRAND_PURPLE }}
          >
            Smart Menu System
          </div>
          <div className="mt-4 text-[3.2rem] font-black tracking-[-0.03em] text-white">
            ₱3,899
          </div>
          <p className="text-sm text-white/40">One-time payment &bull; Lifetime access</p>

          <ul className="mx-auto mt-8 max-w-xs space-y-0 text-left">
            {PRICING_FEATURES.map((feat) => (
              <li
                key={feat}
                className="flex items-center gap-2.5 py-2 text-sm text-white/65"
              >
                <Check className="h-4 w-4 shrink-0 text-green-500" />
                {feat}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <CTAButton fullWidth>Get Smart Menu Now</CTAButton>
          </div>
          <p className="mt-3 text-[11px] text-white/30">
            No monthly fees &bull; No contracts &bull; Start today
          </p>
        </motion.div>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 6: FAQ
 * ==================================================================== */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-white/8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 text-base font-bold text-white">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm leading-relaxed text-white/45">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FAQSection() {
  return (
    <section id="faq" className="py-20 md:py-28" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center">
          <SectionTag>FAQ</SectionTag>
          <h2 className="text-[clamp(1.75rem,5vw,2.6rem)] font-black uppercase leading-[1.05] tracking-[-0.04em] text-white">
            Common Questions
          </h2>
        </div>

        <div className="mt-10">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <CTAButton>Get Started — ₱3,899</CTAButton>
        </div>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 7: Final CTA
 * ==================================================================== */

function FinalCTASection() {
  return (
    <section className="relative overflow-hidden py-24 text-center md:py-32" style={{ background: `linear-gradient(180deg, ${DARK_BG}, ${HERO_BG})` }}>
      {/* Glow */}
      <div
        className="pointer-events-none absolute bottom-[-100px] left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${BRAND_PURPLE}33` }}
      />

      <div className="relative mx-auto max-w-2xl px-6">
        <SectionTag>Last Chance</SectionTag>
        <h2 className="text-[clamp(2rem,6vw,3.2rem)] font-black uppercase leading-[1.0] tracking-[-0.05em] text-white">
          Stop Leaving Money
          <br />
          on Every Order
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/45">
          Ang menu mo, kaya niya mag-sell ng mas malaki. Kailangan lang ng tamang
          system. I-start mo ngayon.
        </p>
        <div className="mt-8">
          <CTAButton size="large">Get Smart Menu Now — ₱3,899</CTAButton>
        </div>
        <p className="mt-3 text-[11px] text-white/30">
          One-time payment &bull; No monthly fees &bull; 48-hour setup
        </p>
      </div>
    </section>
  )
}

/* ====================================================================
 * Footer
 * ==================================================================== */

function Footer() {
  return (
    <footer className="border-t border-white/6 py-8 text-center text-xs text-white/25" style={{ backgroundColor: DARK_BG }}>
      WebNegosyo &bull; Smart Menu System &bull; &copy; {new Date().getFullYear()}
    </footer>
  )
}

/* ====================================================================
 * Main Export
 * ==================================================================== */

export function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: DARK_BG }}>
      <Navigation />
      <HeroSection />

      <CTAStrip subText="Smart Menu automates what your staff can't do consistently">
        Fix Your Menu Now — ₱3,899
      </CTAStrip>

      <ProblemSection />

      <CTAStrip subText="Smart Menu automates what your staff can't do consistently">
        Fix Your Menu Now — ₱3,899
      </CTAStrip>

      <SolutionSection />

      <CTAStrip subText="Works for dine-in, pick-up, and delivery orders">
        Start Selling Smarter — ₱3,899
      </CTAStrip>

      <SocialProofSection />

      <CTAStrip subText="One-time investment. Lifetime returns.">
        Join 100+ Restaurants — ₱3,899
      </CTAStrip>

      <PricingSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Save the complete file**

The file should contain everything from Task 2 Step 1 (imports through Navigation) plus all the section components and main export from this step. Write the entire thing as a single file to `src/components/landing/landing-page.tsx`.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No errors in `landing-page.tsx`. Fix any warnings that appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/landing-page.tsx
git commit -m "feat: rewrite landing page with Smart Menu theme and direct checkout CTAs"
```

---

### Task 4: Verify build and visual check

**Files:**
- No new files

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors. The landing page is a client component so it should bundle correctly.

- [ ] **Step 2: Run dev server and visually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and verify:
1. Navigation is fixed at top with purple "Get Smart Menu" button
2. Hero section shows pill badge, headline, video placeholder, CTA
3. CTA strips appear between sections
4. Problem section shows 3 cards (ordering friction, no upsell, buried margin)
5. Solution section shows 4 cards with "Dine-in - Pick-up - Delivery" tags
6. Social proof shows 3 stats
7. Pricing card shows P3,899 with 10 features
8. FAQ items are collapsible
9. Final CTA section has glow effect
10. All CTA buttons link to `/checkout`
11. Page is responsive on mobile (check via browser dev tools)

- [ ] **Step 3: Commit any fixes**

If any visual issues were found and fixed:

```bash
git add src/components/landing/landing-page.tsx
git commit -m "fix: landing page visual polish"
```

---

### Task 5: Clean up unused booking popup files

**Files:**
- Delete: `src/components/landing/booking-popup/booking-popup.tsx`
- Delete: `src/components/landing/booking-popup/step-one.tsx`
- Delete: `src/components/landing/booking-popup/step-two.tsx`
- Delete: `src/components/landing/booking-popup/confirmation.tsx`

The booking popup was used by the old landing page for "Book a Call" flow. Since all CTAs now go to `/checkout`, these files are unused.

- [ ] **Step 1: Verify no other imports reference booking-popup**

Search for any imports of `booking-popup` outside of the old landing page:

```bash
grep -r "booking-popup" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: No results (the old import was removed in Task 3).

- [ ] **Step 2: Delete the booking popup directory**

```bash
rm -rf src/components/landing/booking-popup/
```

- [ ] **Step 3: Check if checkout-form.tsx is still used**

```bash
grep -r "checkout-form" src/ --include="*.tsx" --include="*.ts" -l
```

If no results, also delete it:

```bash
rm src/components/landing/checkout-form.tsx
```

- [ ] **Step 4: Run build to confirm nothing broke**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove unused booking popup components"
```
