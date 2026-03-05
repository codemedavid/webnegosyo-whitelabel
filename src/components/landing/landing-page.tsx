'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Menu, X, Users, ShoppingCart, ChevronRight, TrendingDown, UserX, DollarSign, LayoutGrid, BarChart3, Smartphone, Package, Check } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────
const BRAND_RED = '#FF3B30'
const DARK_BG = '#0F172A'
const MESSENGER_LINK =
  'https://m.me/FACEBOOK_PAGE_ID?text=Hi%2C%20I%20want%20to%20learn%20more%20about%20the%20Smart%20Menu%20System'

// ── Navigation ─────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'The Problem', href: '#problem' },
  { label: 'The System', href: '#system' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0F172A]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
              style={{ backgroundColor: BRAND_RED }}
            >
              <Menu className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              WebNegosyo
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <a
              href={MESSENGER_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-red-500/25"
              style={{ backgroundColor: BRAND_RED }}
            >
              <MessageCircle className="h-4 w-4" />
              Book a Call
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden flex items-center justify-center h-10 w-10 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden border-t border-white/10 bg-[#0F172A]/95 backdrop-blur-xl"
          >
            <div className="px-6 py-4 space-y-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-4 py-3 text-base font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-3">
                <a
                  href={MESSENGER_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 text-sm font-semibold text-white transition-all"
                  style={{ backgroundColor: BRAND_RED }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Book a Call
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

// ── Social Proof Badges ────────────────────────────────────────────────

const SOCIAL_PROOF = [
  { icon: Users, label: '100+ Restaurants' },
  { icon: ShoppingCart, label: '10,000+ Orders' },
  { icon: MessageCircle, label: 'Works with Messenger' },
] as const

function SocialProofBadges() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="flex flex-wrap items-center justify-center gap-3 md:gap-4"
    >
      {SOCIAL_PROOF.map((badge) => {
        const Icon = badge.icon
        return (
          <div
            key={badge.label}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 backdrop-blur-sm"
          >
            <Icon className="h-4 w-4 text-gray-400" />
            <span className="font-medium">{badge.label}</span>
          </div>
        )
      })}
    </motion.div>
  )
}

// ── Phone Mockup ───────────────────────────────────────────────────────

function PhoneMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-[280px] md:w-[320px]"
    >
      {/* Glow effect */}
      <div
        className="absolute -inset-8 rounded-[3rem] opacity-30 blur-3xl"
        style={{
          background: `radial-gradient(ellipse at center, ${BRAND_RED}40 0%, transparent 70%)`,
        }}
      />

      {/* Phone frame */}
      <div className="relative rounded-[2.5rem] border border-white/15 bg-gradient-to-b from-gray-800 to-gray-900 p-3 shadow-2xl shadow-black/50">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-6 w-28 rounded-b-2xl bg-gray-900 z-10" />

        {/* Screen */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 py-2 bg-gray-50">
            <span className="text-[10px] font-semibold text-gray-800">9:41</span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-800" />
              <div className="h-1.5 w-1.5 rounded-full bg-gray-800" />
              <div className="h-1.5 w-1.5 rounded-full bg-gray-800" />
            </div>
          </div>

          {/* App header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md" style={{ backgroundColor: BRAND_RED }} />
              <span className="text-xs font-bold text-gray-900">Kusina ni Maria</span>
            </div>
          </div>

          {/* Menu items */}
          <div className="p-3 space-y-2.5">
            {/* Category */}
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">
              Bestsellers
            </div>

            {/* Item 1 - with upsell badge */}
            <div className="relative rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm">
              <div className="h-24 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center">
                <span className="text-3xl">🍗</span>
              </div>
              <div className="absolute top-2 right-2">
                <div className="rounded-full px-2 py-0.5 text-[8px] font-bold text-white" style={{ backgroundColor: BRAND_RED }}>
                  ★ STAR
                </div>
              </div>
              <div className="px-3 py-2">
                <div className="text-[11px] font-bold text-gray-900">Chicken Inasal Meal</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] font-bold" style={{ color: BRAND_RED }}>₱189</span>
                  <div className="h-5 w-5 rounded-full flex items-center justify-center" style={{ backgroundColor: BRAND_RED }}>
                    <span className="text-white text-[10px]">+</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Item 2 */}
            <div className="rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm">
              <div className="h-24 bg-gradient-to-br from-yellow-100 to-yellow-50 flex items-center justify-center">
                <span className="text-3xl">🍜</span>
              </div>
              <div className="px-3 py-2">
                <div className="text-[11px] font-bold text-gray-900">Pancit Canton Special</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] font-bold" style={{ color: BRAND_RED }}>₱149</span>
                  <div className="h-5 w-5 rounded-full flex items-center justify-center" style={{ backgroundColor: BRAND_RED }}>
                    <span className="text-white text-[10px]">+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Upsell prompt overlay */}
          <div className="mx-3 mb-3 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 p-3 border border-white/10">
            <div className="text-[9px] font-bold text-white mb-1">🍟 Perfect with your order...</div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-200 to-orange-100 flex items-center justify-center text-sm shrink-0">
                🥤
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-medium text-white">Add Iced Tea?</div>
                <div className="text-[8px] text-green-400 font-semibold">+₱35 only</div>
              </div>
              <div className="shrink-0 rounded-full px-2.5 py-1 text-[8px] font-bold text-white" style={{ backgroundColor: BRAND_RED }}>
                Add
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Hero Section ───────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden pt-16"
      style={{ backgroundColor: DARK_BG }}
    >
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[40%] -right-[20%] h-[80%] w-[60%] rounded-full opacity-[0.07] blur-[120px]"
          style={{ backgroundColor: BRAND_RED }}
        />
        <div
          className="absolute -bottom-[30%] -left-[20%] h-[60%] w-[50%] rounded-full opacity-[0.05] blur-[100px]"
          style={{ backgroundColor: '#3B82F6' }}
        />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8 py-20 md:py-28 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            {/* Social proof badges */}
            <div className="mb-8 lg:mb-10">
              <SocialProofBadges />
            </div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight"
            >
              Your Menu
              <br />
              Should Be Your
              <br />
              <span className="relative">
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${BRAND_RED}, #FF6B61)`,
                  }}
                >
                  Best Salesperson
                </span>
                {/* Underline accent */}
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute -bottom-2 left-0 right-0 h-1 rounded-full origin-left"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${BRAND_RED}, ${BRAND_RED}00)`,
                  }}
                />
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-6 md:mt-8 text-xl md:text-2xl text-gray-300 leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              Karamihan sa food businesses, nag-iiwan ng pera sa mesa sa bawat order.{' '}
              <span className="text-white font-medium">We fix that.</span>
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-10 md:mt-12 flex flex-col sm:flex-row items-center gap-4 lg:justify-start justify-center"
            >
              <a
                href={MESSENGER_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative inline-flex items-center gap-3 rounded-full px-8 py-4 text-lg font-bold text-white transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-red-500/30 active:scale-[0.98]"
                style={{ backgroundColor: BRAND_RED }}
              >
                {/* Button glow */}
                <span
                  className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"
                  style={{ backgroundColor: BRAND_RED }}
                />
                <span className="relative flex items-center gap-3">
                  <MessageCircle className="h-5 w-5" />
                  Book Your Free 15-Min Strategy Call
                  <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </a>

              <span className="text-sm text-gray-500">
                Free. No commitment.
              </span>
            </motion.div>
          </div>

          {/* Right: Phone Mockup */}
          <div className="hidden lg:flex items-center justify-center">
            <PhoneMockup />
          </div>
        </div>

        {/* Mobile phone mockup (below content on small screens) */}
        <div className="lg:hidden mt-16 flex justify-center">
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}

// ── McDonald's Story Section ──────────────────────────────────────────

function McDonaldsStorySection() {
  return (
    <section id="story" className="relative bg-white py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 text-center leading-tight tracking-tight"
        >
          What McDonald&apos;s Knows That
          <br className="hidden sm:block" />
          Most Food Businesses Don&apos;t
        </motion.h2>

        {/* Storytelling Body */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-12 md:mt-16 max-w-3xl mx-auto space-y-6 text-lg md:text-xl text-gray-600 leading-relaxed"
        >
          <p>
            Alam mo yung mga kiosk sa McDonald&apos;s? Karamihan ng tao akala nila,
            pang-automate lang yun ng ordering — para mabawasan ang staff, para
            mas mabilis.
          </p>
          <p className="text-gray-900 font-medium">
            Pero hindi yun ang main reason.
          </p>
          <p>
            Ang totoo?{' '}
            <span className="font-bold" style={{ color: BRAND_RED }}>
              The menu IS the salesperson.
            </span>{' '}
            Bawat screen, bawat &quot;Would you like to make it a meal?&quot;,
            bawat suggestion na lumalabas — lahat yun, designed para mag-order ka
            ng mas marami without you even noticing.
          </p>
          <p>
            Hindi sila nag-rely sa cashier para mag-upsell.{' '}
            <span className="text-gray-900 font-semibold">They built a system.</span>
          </p>
        </motion.div>

        {/* Comparison Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-16 md:mt-20 grid md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto"
        >
          {/* Traditional Menu Card */}
          <div className="relative rounded-2xl border-2 border-gray-200 bg-gray-50 p-6 md:p-8 overflow-hidden">
            <div className="absolute top-4 right-4 rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Traditional
            </div>
            <h3 className="text-xl font-bold text-gray-400 mb-6">Traditional Menu</h3>
            {/* Mock menu list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-2">
                <span className="text-sm text-gray-400">Chicken Adobo</span>
                <span className="text-sm text-gray-400">P150</span>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-2">
                <span className="text-sm text-gray-400">Pork Sinigang</span>
                <span className="text-sm text-gray-400">P180</span>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-2">
                <span className="text-sm text-gray-400">Pancit Canton</span>
                <span className="text-sm text-gray-400">P120</span>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-gray-300 pb-2">
                <span className="text-sm text-gray-400">Halo-Halo</span>
                <span className="text-sm text-gray-400">P90</span>
              </div>
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm text-gray-400">Iced Tea</span>
                <span className="text-sm text-gray-400">P45</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
              <X className="h-4 w-4 text-gray-300" />
              <span>No suggestions</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
              <X className="h-4 w-4 text-gray-300" />
              <span>No upselling</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
              <X className="h-4 w-4 text-gray-300" />
              <span>Static list — walang nag-gu-guide</span>
            </div>
          </div>

          {/* Smart Menu Card */}
          <div className="relative rounded-2xl border-2 p-6 md:p-8 overflow-hidden shadow-xl" style={{ borderColor: BRAND_RED, backgroundColor: '#FFF5F5' }}>
            <div className="absolute top-4 right-4 rounded-full px-3 py-1 text-xs font-bold text-white uppercase tracking-wider" style={{ backgroundColor: BRAND_RED }}>
              Smart Menu
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-6">Smart Menu</h3>
            {/* Mock smart menu */}
            <div className="space-y-3">
              {/* Item with star badge */}
              <div className="rounded-xl bg-white border border-gray-100 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🍗</span>
                    <span className="text-sm font-bold text-gray-900">Chicken Inasal Meal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: BRAND_RED }}>★ STAR</span>
                    <span className="text-sm font-bold" style={{ color: BRAND_RED }}>P189</span>
                  </div>
                </div>
              </div>
              {/* Upsell prompt */}
              <div className="rounded-xl bg-gray-900 p-3">
                <div className="text-[10px] font-bold text-white mb-1.5">🍟 Make it a meal?</div>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center text-xs shrink-0">🥤</div>
                  <div className="flex-1">
                    <div className="text-[10px] text-white font-medium">Add Iced Tea + Rice</div>
                    <div className="text-[9px] text-green-400 font-semibold">Save P25!</div>
                  </div>
                  <div className="rounded-full px-2.5 py-1 text-[9px] font-bold text-white" style={{ backgroundColor: BRAND_RED }}>
                    Add
                  </div>
                </div>
              </div>
              {/* Bundle highlight */}
              <div className="rounded-xl bg-white border-2 p-3 shadow-sm" style={{ borderColor: `${BRAND_RED}40` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎁</span>
                    <span className="text-sm font-bold text-gray-900">Family Bundle</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Save 15%</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-700">
              <ChevronRight className="h-4 w-4" style={{ color: BRAND_RED }} />
              <span className="font-medium">Smart upsell prompts</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 mt-2">
              <ChevronRight className="h-4 w-4" style={{ color: BRAND_RED }} />
              <span className="font-medium">Bundle suggestions</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 mt-2">
              <ChevronRight className="h-4 w-4" style={{ color: BRAND_RED }} />
              <span className="font-medium">Highlighted bestsellers</span>
            </div>
          </div>
        </motion.div>

        {/* Transition line */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-16 md:mt-20 text-center text-2xl md:text-3xl font-bold text-gray-900"
        >
          We built the same system — for your business.
        </motion.p>
      </div>
    </section>
  )
}

// ── Problem Section ───────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    icon: TrendingDown,
    text: 'Yung customer mo, nag-o-order ng minimum kasi walang gumagabay sa kanila na mag-order ng more.',
  },
  {
    icon: UserX,
    text: 'Walang upselling system — busy yung staff mo, static yung menu mo. Walang nag-su-suggest.',
  },
  {
    icon: DollarSign,
    text: 'Every missed upsell is money that walks out the door. At nangyayari to sa bawat customer, araw-araw.',
  },
] as const

function ProblemSection() {
  return (
    <section id="problem" className="relative py-20 md:py-28 lg:py-32" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center leading-tight tracking-tight max-w-4xl mx-auto"
        >
          You&apos;re Not Losing Because of Foot Traffic.{' '}
          <span style={{ color: BRAND_RED }}>
            You&apos;re Losing Because Your Menu Isn&apos;t Selling.
          </span>
        </motion.h2>

        {/* Pain Point Cards */}
        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          {PAIN_POINTS.map((point, index) => {
            const Icon = point.icon
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div
                  className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-6"
                  style={{ backgroundColor: `${BRAND_RED}20` }}
                >
                  <Icon className="h-6 w-6" style={{ color: BRAND_RED }} />
                </div>
                <p className="text-lg text-gray-300 leading-relaxed">
                  {point.text}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Solution Section ──────────────────────────────────────────────────

const BLUEPRINT_CARDS = [
  {
    icon: LayoutGrid,
    title: 'Menu Curation Blueprint',
    description: 'Paano i-layout ang menu mo para ma-guide ang customer kung saan ka kumikita.',
  },
  {
    icon: BarChart3,
    title: 'Menu Engineering Blueprint',
    description: 'Alam mo ba kung aling item mo ang Star at aling item ang Dead Weight? Dito mo malalaman.',
  },
  {
    icon: Smartphone,
    title: 'App Selling System Blueprint',
    description: 'Turn your menu into a conversion machine. Hindi lang basta menu — salesperson.',
  },
  {
    icon: Package,
    title: 'Bundling System',
    description: "Yung 'Make it a Meal' na system ng McDonald's? Ganun din to — automated bundles na nagbo-boost ng AOV mo.",
  },
] as const

function SolutionSection() {
  return (
    <section id="system" className="relative bg-white py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 text-center leading-tight tracking-tight max-w-4xl mx-auto"
        >
          Introducing the Smart Menu{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(135deg, ${BRAND_RED}, #FF6B61)`,
            }}
          >
            That Sells For You
          </span>
        </motion.h2>

        {/* Blueprint Cards */}
        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-8">
          {BLUEPRINT_CARDS.map((card, index) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: index * 0.12 }}
                className="bg-white border border-gray-200 rounded-2xl p-8 hover:-translate-y-1 hover:shadow-lg transition-all"
              >
                <div
                  className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-6"
                  style={{ backgroundColor: `${BRAND_RED}15` }}
                >
                  <Icon className="h-6 w-6" style={{ color: BRAND_RED }} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {card.title}
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed">
                  {card.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Smart Menu Ordering System Section ────────────────────────────────

const SMART_MENU_FEATURES = [
  'Handles Dine-in, Pick-up, at Delivery — isang system lang.',
  'Never misses an upsell opportunity. Kahit wala kang staff na nag-su-suggest, yung menu mo mismo ang gagawa.',
  'Lahat ng orders, diretso sa Messenger mo. No app needed para sa customers.',
  'Automated bundling suggestions sa bawat order.',
  'Works on any phone — walang need mag-install ng app.',
  'Real-time notifications sa bawat bagong order.',
] as const

function SmartMenuSystemSection() {
  return (
    <section className="relative py-20 md:py-28 lg:py-32" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center leading-tight tracking-tight max-w-4xl mx-auto mb-14 md:mb-20"
        >
          Plus: Your Very Own{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(135deg, ${BRAND_RED}, #FF6B61)`,
            }}
          >
            Smart Menu Ordering System
          </span>
        </motion.h2>

        {/* Content: Features + Mockup */}
        <div className="flex flex-col lg:flex-row gap-12 items-center">
          {/* Left: Feature Bullets */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="flex-1 space-y-5"
          >
            {SMART_MENU_FEATURES.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="flex items-start gap-4"
              >
                <div className="mt-1 shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-green-500/20">
                  <Check className="h-4 w-4 text-green-400" />
                </div>
                <p className="text-lg text-gray-300 leading-relaxed">
                  {feature}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Right: Phone/Tablet Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="relative w-full max-w-[360px]">
              {/* Glow */}
              <div
                className="absolute -inset-6 rounded-[2rem] opacity-20 blur-3xl"
                style={{
                  background: `radial-gradient(ellipse at center, ${BRAND_RED}40 0%, transparent 70%)`,
                }}
              />

              {/* Device frame */}
              <div className="relative rounded-[2rem] border border-white/15 bg-gradient-to-b from-gray-800 to-gray-900 p-4 shadow-2xl shadow-black/50">
                <div className="rounded-[1.5rem] bg-white overflow-hidden">
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg" style={{ backgroundColor: BRAND_RED }} />
                      <span className="text-sm font-bold text-gray-900">Your Restaurant</span>
                    </div>
                  </div>

                  {/* Order Type Selector */}
                  <div className="p-4 space-y-3">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      How would you like your order?
                    </div>

                    {/* Order type cards */}
                    {[
                      { emoji: '🍽️', label: 'Dine-in', sublabel: 'Eat here' },
                      { emoji: '🛍️', label: 'Pick-up', sublabel: 'Take away' },
                      { emoji: '🛵', label: 'Delivery', sublabel: 'To your door' },
                    ].map((orderType, i) => (
                      <div
                        key={orderType.label}
                        className="flex items-center gap-3 rounded-xl border p-3.5 transition-all"
                        style={{
                          borderColor: i === 0 ? BRAND_RED : '#E5E7EB',
                          backgroundColor: i === 0 ? `${BRAND_RED}08` : 'white',
                        }}
                      >
                        <span className="text-xl">{orderType.emoji}</span>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-900">{orderType.label}</div>
                          <div className="text-xs text-gray-500">{orderType.sublabel}</div>
                        </div>
                        {i === 0 && (
                          <div
                            className="h-5 w-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: BRAND_RED }}
                          >
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Messenger notification mock */}
                    <div className="mt-2 rounded-xl bg-gradient-to-r from-blue-50 to-blue-100 p-3 border border-blue-200">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <div className="text-[10px] font-bold text-blue-900">New Order Received!</div>
                          <div className="text-[9px] text-blue-700">Diretso sa Messenger mo</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ── How It Works Section ──────────────────────────────────────────────

const STEPS = [
  {
    number: 1,
    title: 'Book a Call',
    description: 'Pag-usapan natin yung business mo.',
  },
  {
    number: 2,
    title: 'We Set Up Your Smart Menu',
    description: 'Kasama na lahat ng blueprints at system.',
  },
  {
    number: 3,
    title: 'Launch',
    description: 'Panoorin mo na lang tumaas ang Average Order Value mo.',
  },
] as const

function HowItWorksSection() {
  return (
    <section id="process" className="relative bg-white py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 text-center leading-tight tracking-tight"
        >
          How It Works
        </motion.h2>

        {/* Steps */}
        <div className="mt-14 md:mt-20 flex flex-col md:flex-row gap-8 items-start">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="flex-1 relative flex flex-col items-center text-center"
            >
              {/* Connecting line on desktop (between steps, not after last) */}
              {index < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-7 left-[calc(50%+2rem)] right-[calc(-50%+2rem)] border-t-2 border-dashed border-gray-300" />
              )}

              {/* Number circle */}
              <div
                className="relative z-10 flex items-center justify-center h-14 w-14 rounded-full text-2xl font-bold text-white shadow-lg"
                style={{ backgroundColor: BRAND_RED }}
              >
                {step.number}
              </div>

              {/* Step title */}
              <h3 className="mt-6 text-xl font-bold text-gray-900">
                {step.title}
              </h3>

              {/* Step description */}
              <p className="mt-3 text-lg text-gray-600 leading-relaxed max-w-xs">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Value Stack Section ──────────────────────────────────────────────

const VALUE_STACK_ITEMS = [
  { name: 'Smart Menu Ordering System (Dine-in + Pick-up + Delivery)', value: '10,000' },
  { name: 'Menu Curation Blueprint', value: '2,500' },
  { name: 'Menu Engineering Blueprint', value: '2,500' },
  { name: 'App Selling System Blueprint', value: '2,500' },
  { name: 'Bundling System', value: '2,500' },
] as const

function ValueStackSection() {
  return (
    <section id="pricing" className="relative py-20 md:py-28 lg:py-32" style={{ backgroundColor: DARK_BG }}>
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center leading-tight tracking-tight"
        >
          Everything You Get
        </motion.h2>

        {/* Stack List */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-14 md:mt-20"
        >
          {VALUE_STACK_ITEMS.map((item, index) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.08 }}
              className="flex items-center justify-between py-5 border-b border-white/10"
            >
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 shrink-0 text-green-400" />
                <span className="text-lg text-gray-300">{item.name}</span>
              </div>
              <span className="text-lg text-gray-500 line-through ml-4 shrink-0">
                ₱{item.value}
              </span>
            </motion.div>
          ))}

          {/* Total Value Row */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex items-center justify-between pt-6 pb-2"
          >
            <span className="text-xl md:text-2xl font-bold text-white">Total Value:</span>
            <span className="text-xl md:text-2xl font-bold text-white">₱20,000+</span>
          </motion.div>
        </motion.div>

        {/* Price Reveal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-16 md:mt-20 text-center"
        >
          <p className="text-2xl md:text-3xl text-gray-400 font-medium">
            Pero hindi mo babayaran ng ganun.
          </p>
          <p
            className="mt-4 text-5xl md:text-6xl font-bold"
            style={{ color: BRAND_RED }}
          >
            ₱3,499 lang.
          </p>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 flex flex-col items-center gap-4"
        >
          <a
            href={MESSENGER_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-3 rounded-full px-8 py-4 text-lg font-bold text-white transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-red-500/30 active:scale-[0.98]"
            style={{ backgroundColor: BRAND_RED }}
          >
            <span
              className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"
              style={{ backgroundColor: BRAND_RED }}
            />
            <span className="relative flex items-center gap-3">
              <MessageCircle className="h-5 w-5" />
              Book Your Free Strategy Call
            </span>
          </a>
          <span className="text-sm text-gray-500">
            One-time payment. Walang monthly fees.
          </span>
        </motion.div>
      </div>
    </section>
  )
}

// ── Landing Page (exported) ────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: DARK_BG }}>
      <Navigation />
      <HeroSection />
      <McDonaldsStorySection />
      <ProblemSection />
      <SolutionSection />
      <SmartMenuSystemSection />
      <HowItWorksSection />
      <ValueStackSection />
      {/* More sections will be added in subsequent tasks */}
    </div>
  )
}
