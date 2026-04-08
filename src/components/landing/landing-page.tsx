'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { Check, ChevronDown, ChevronRight, Play, UtensilsCrossed } from 'lucide-react'
import { MetaPixelPageView } from '@/components/tracking/meta-pixel-page-view'
import { trackMetaEvent } from '@/lib/meta-pixel'

const CHECKOUT_URL = '/checkout'
const BRAND = '#ea580c'
const BRAND_DEEP = '#9a3412'
const BRAND_GOLD = '#f59e0b'
const DARK_BG = '#0c0a07'
const HERO_BG = '#14100b'
const ALT_BG = '#110e09'
const VIEWPORT = { once: true, amount: 0.2 } as const
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID


const PRICING_FEATURES = [
'Website Ordering - This is your smart menu',
'Upselling System',
'Bundles System',
'Product Management System',
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
      onClick={() => {
        trackMetaEvent('InitiateCheckout', {
          content_name: 'Smart Menu System',
          currency: 'PHP',
          value: 3899,
        })
      }}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl font-extrabold uppercase tracking-[0.06em] text-white transition-transform duration-200 hover:-translate-y-0.5 ${sizeClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{
        background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DEEP})`,
        boxShadow: '0 8px 30px rgba(234, 88, 12, 0.3)',
      }}
    >
      {children}
      <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  )
}


function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-3 inline-block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: BRAND }}>
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
      {/* Warm primary glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-120px] h-[400px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${BRAND}2e` }}
      />
      {/* Secondary warm gold glow */}
      <div
        className="pointer-events-none absolute right-[-100px] top-[200px] h-[250px] w-[350px] rounded-full blur-3xl"
        style={{ backgroundColor: `${BRAND_GOLD}12` }}
      />
      {/* Warm dot pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(234,88,12,0.4) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Subtle utensils decoration */}
      <div className="pointer-events-none absolute right-[8%] top-[12%] opacity-[0.03]">
        <UtensilsCrossed className="h-52 w-52 text-white" strokeWidth={0.5} />
      </div>
      {/* Bottom gradient fade */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{ background: `linear-gradient(180deg, transparent, ${HERO_BG})` }}
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h1 className="text-[clamp(2.5rem,8vw,5rem)] font-black uppercase leading-[0.95] tracking-[-0.05em] text-white">
          You Can Sell More With Smart Menu
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[clamp(0.85rem,2vw,1rem)] leading-relaxed text-white/55">
          Hindi sapat na maganda lang ang menu mo. Kailangan nitong mag-guide,
          mag-suggest, at mag-push ng bigger orders &mdash; automatically.
        </p>

        <div className="relative mx-auto mt-8 w-full max-w-[580px] overflow-hidden rounded-2xl border border-white/8" style={{ aspectRatio: '16/9' }}>
          <iframe
            src="https://www.youtube.com/embed/q1GZEDwFLv8?rel=0"
            title="Smart Menu System"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
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
 * Section 2: Testimonials
 * ==================================================================== */

function TestimonialSection() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  function handlePlayClick() {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play()
      setIsPlaying(true)
    }
  }

  return (
    <section className="py-20 md:py-28" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-5xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
          className="text-center text-[clamp(1.75rem,5vw,2.8rem)] font-black leading-[1.1] tracking-[-0.03em] text-white"
        >
          What people are saying:
        </motion.h2>

        {/* Video */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative mx-auto mt-12 w-full max-w-[640px] cursor-pointer overflow-hidden rounded-2xl border border-white/10"
          onClick={handlePlayClick}
        >
          <video
            ref={videoRef}
            src="/testimonial.mp4"
            className="block w-full"
            style={{ aspectRatio: '1/1', objectFit: 'cover' }}
            playsInline
            onEnded={() => setIsPlaying(false)}
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform duration-200 hover:scale-110"
                style={{ backgroundColor: `${BRAND}e6`, boxShadow: `0 0 40px ${BRAND}66` }}
              >
                <Play className="ml-1 h-8 w-8 fill-white text-white" />
              </div>
            </div>
          )}
        </motion.div>

        {/* Testimonial cards — scattered layout like acquisition.com */}
        <div className="relative mx-auto flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center md:gap-8">
          {/* Card 1 — chat screenshot */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="w-full max-w-[320px] overflow-hidden rounded-xl bg-white shadow-2xl md:-rotate-3"
          >
            <Image
              src="/testimonial1.jpg"
              alt="Client testimonial — praising the hero banner feature"
              width={320}
              height={400}
              className="h-auto w-full"
            />
          </motion.div>

          {/* Card 2 — Facebook review screenshot */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="w-full max-w-[320px] overflow-hidden rounded-xl bg-white shadow-2xl md:mt-10 md:rotate-2"
          >
            <Image
              src="/testimonial2.png"
              alt="Facebook review from Kenya Mendoza recommending WebNegosyo"
              width={320}
              height={120}
              className="h-auto w-full"
            />
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mx-auto mt-10 max-w-xl text-center text-[11px] leading-relaxed text-white/25"
        >
          Individual experiences presented here may not be typical.
          Their background, education, effort, and application affected their experience.
        </motion.p>
      </div>
    </section>
  )
}

/* ====================================================================
 * Section 5: Pricing
 * ==================================================================== */

function PricingSection() {
  return (
    <section id="pricing" className="relative py-20 text-center md:py-28" style={{ backgroundColor: ALT_BG }}>
      {/* Subtle plate-ring decoration */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: '520px',
          height: '520px',
          border: '2px dashed rgba(234, 88, 12, 0.05)',
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6">
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
            borderColor: `${BRAND}40`,
            background: `linear-gradient(145deg, ${BRAND}14, ${BRAND}08)`,
          }}
        >
          <div
            className="text-[13px] font-bold uppercase tracking-[0.1em]"
            style={{ color: BRAND }}
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
        style={{ backgroundColor: `${BRAND}33` }}
      />
      {/* Subtle utensils decoration */}
      <div className="pointer-events-none absolute left-[6%] bottom-[15%] opacity-[0.03]">
        <UtensilsCrossed className="h-40 w-40 rotate-[-15deg] text-white" strokeWidth={0.5} />
      </div>

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
      <MetaPixelPageView pixelId={META_PIXEL_ID} />
      <AnnouncementBanner />
      <HeroSection />

      <TestimonialSection />

      <div
        className="py-12 text-center"
        style={{
          backgroundColor: HERO_BG,
          borderTop: '1px solid rgba(234, 88, 12, 0.08)',
          borderBottom: '1px solid rgba(234, 88, 12, 0.08)',
        }}
      >
        <Image
          src="/product.png"
          alt="Smart Menu product preview"
          width={580}
          height={420}
          className="mx-auto mb-8 px-4 h-auto w-full max-w-[580px] rounded-2xl"
        />
        <CTAButton>Join 100+ Restaurants &mdash; &#8369;3,899</CTAButton>
        <p className="mt-3 text-xs text-white/30">One-time investment. Lifetime returns.</p>
      </div>

      <PricingSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </div>
  )
}
