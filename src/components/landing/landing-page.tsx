'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  TrendingDown,
  DollarSign,
  Utensils,
  ArrowUpRight,
  Target,
} from 'lucide-react'

const CHECKOUT_URL = '/checkout'
const BRAND_PURPLE = '#7c3aed'
const DARK_BG = '#0a0a0a'
const HERO_BG = '#0F0B1A'
const ALT_BG = '#111111'
const VIEWPORT = { once: true, amount: 0.2 } as const

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
    text: '\u201cMake it a meal?\u201d \u2014 automatic bundle prompts na nagpapataas ng basket size. Customer feels like may deal, ikaw naman kumikita pa rin.',
  },
  {
    icon: ArrowUpRight,
    title: 'Upgrade Pairs',
    text: 'Side-by-side comparison ng ala carte vs. upgrade. Nakikita agad ng customer ang value difference \u2014 at 40%+ ang nag-u-upgrade.',
  },
  {
    icon: ShoppingCart,
    title: 'Checkout Upsells',
    text: '\u201cBefore you go...\u201d \u2014 last-minute suggestions bago mag-checkout. Hindi nakakainis, pero napaka-effective sa dagdag na items.',
  },
  {
    icon: Target,
    title: 'Menu Engineering',
    text: 'Alam mo na kung alin ang star items, hidden gems, at slow movers. I-push ang tama, i-hide ang hindi \u2014 data-driven ang menu mo.',
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
    a: 'Hindi \u2014 gumagana ang Smart Menu para sa dine-in, pick-up, at delivery. Lahat ng upsell features, nandoon sa lahat ng order type.',
  },
  {
    q: 'May monthly fee ba?',
    a: 'Wala. One-time payment lang ang \u20b13,899. Kasama na ang lifetime updates at lahat ng features.',
  },
  {
    q: 'Gaano kabilis ma-setup?',
    a: 'Within 48 hours after payment, live na ang Smart Menu mo. We handle the technical setup para sa iyo.',
  },
  {
    q: 'Paano kung hindi gumana sa business ko?',
    a: 'Every food business na may menu \u2014 gumana ang Smart Menu. Bundles, upgrades, at upsells work across cuisines and order types.',
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
        boxShadow: '0 8px 30px rgba(124, 58, 237, 0.3)',
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

function AnnouncementBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-white/6 py-3 text-center" style={{ backgroundColor: DARK_BG }}>
      <Link
        href={CHECKOUT_URL}
        className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-white/80 transition-colors hover:text-white"
      >
        <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
        <span>Smart Menu System &mdash; One-Time &#8369;3,899 &bull; No Monthly Fees</span>
        <ChevronRight className="h-3.5 w-3.5 text-white/40" />
      </Link>
    </div>
  )
}

/* ====================================================================
 * Section 1: Hero
 * ==================================================================== */

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden pb-20 pt-24 md:pb-24 md:pt-32"
      style={{ backgroundColor: HERO_BG }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${BRAND_PURPLE}2e` }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{ background: `linear-gradient(180deg, transparent, ${HERO_BG})` }}
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h1 className="text-[clamp(2.5rem,8vw,5rem)] font-black uppercase leading-[0.95] tracking-[-0.05em] text-white">
          You Can Sell More With Smart Menu
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[clamp(0.95rem,2vw,1.2rem)] leading-relaxed text-white/55">
          Hindi sapat na maganda lang ang menu mo. Kailangan nitong mag-guide,
          mag-suggest, at mag-push ng bigger orders &mdash; automatically.
        </p>

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

        <p className="mx-auto mt-7 max-w-lg text-sm leading-relaxed text-white/40">
          Isang system na nag-a-automate ng upsells, bundles, at upgrades &mdash; para
          every order, mas malaki ang value.
        </p>

        <div className="mt-7">
          <CTAButton size="large">Get Smart Menu Now &mdash; &#8369;3,899</CTAButton>
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
            nila &mdash; at hindi nila alam kung magkano ang nawawala.
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
            Every feature is designed para tumaas ang average order value &mdash;
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
            Walang monthly fees, walang hidden charges. Isang bayad lang &mdash;
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
            &#8369;3,899
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
          <CTAButton>Get Started &mdash; &#8369;3,899</CTAButton>
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
          <CTAButton size="large">Get Smart Menu Now &mdash; &#8369;3,899</CTAButton>
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
      <AnnouncementBanner />
      <HeroSection />

      <CTAStrip subText="Smart Menu automates what your staff can&apos;t do consistently">
        Fix Your Menu Now &mdash; &#8369;3,899
      </CTAStrip>

      <ProblemSection />

      <CTAStrip subText="Smart Menu automates what your staff can&apos;t do consistently">
        Fix Your Menu Now &mdash; &#8369;3,899
      </CTAStrip>

      <SolutionSection />

      <CTAStrip subText="Works for dine-in, pick-up, and delivery orders">
        Start Selling Smarter &mdash; &#8369;3,899
      </CTAStrip>

      <SocialProofSection />

      <CTAStrip subText="One-time investment. Lifetime returns.">
        Join 100+ Restaurants &mdash; &#8369;3,899
      </CTAStrip>

      <PricingSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </div>
  )
}
