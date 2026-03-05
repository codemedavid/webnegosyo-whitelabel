'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Menu, X, Users, ShoppingCart, ChevronRight } from 'lucide-react'

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

// ── Landing Page (exported) ────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: DARK_BG }}>
      <Navigation />
      <HeroSection />
      {/* More sections will be added in subsequent tasks */}
    </div>
  )
}
