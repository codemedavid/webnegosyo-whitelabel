'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  DollarSign,
  LayoutGrid,
  Menu,
  MessageCircle,
  Package,
  ShoppingCart,
  Smartphone,
  TrendingDown,
  UserX,
  Users,
  X,
} from 'lucide-react'

const BRAND_RED = '#FF3B30'
const INK = '#16110F'
const DARK_BG = '#110D0B'
const PAPER_BG = '#FFF7ED'
const SAND_BG = '#F2E2CA'
const MESSENGER_LINK =
  'https://m.me/FACEBOOK_PAGE_ID?text=Hi%2C%20I%20want%20to%20learn%20more%20about%20the%20Smart%20Menu%20System'
const PRIMARY_CTA = 'Book My Free 15-Min Menu Growth Call'
const PRIMARY_SUBCTA =
  'We will show you where your menu is leaking upgrades, bundles, and average order value.'
const VIEWPORT = { once: true, amount: 0.25 } as const

const NAV_LINKS = [
  { label: 'Why It Works', href: '#why-it-works' },
  { label: 'What You Get', href: '#what-you-get' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const

const SOCIAL_PROOF = [
  { icon: Users, label: '100+ restaurant funnels observed' },
  { icon: ShoppingCart, label: '10,000+ customer orders processed' },
  { icon: MessageCircle, label: 'Messenger-ready ordering flow' },
] as const

const PAIN_POINTS = [
  {
    icon: TrendingDown,
    title: 'Customers default to the safe order',
    text: 'Kapag walang gumagabay, ang pinaka-obvious na item ang binibili - hindi ang pinaka-profitable.',
  },
  {
    icon: UserX,
    title: 'Staff cannot upsell every time',
    text: 'Pag busy ang team mo, nawawala ang suggestive selling. Hindi naaalala ang next best offer.',
  },
  {
    icon: DollarSign,
    title: 'Margin gets buried in the menu',
    text: 'Hindi napapansin ang bundles, upgrades, at high-margin items dahil pare-pareho lang ang presentation.',
  },
] as const

const PLAYBOOK_ITEMS = [
  'Menu engineering so profitable items get the best real estate.',
  'Bundle prompts that feel useful instead of pushy.',
  'Upgrade timing placed where customers are most likely to accept.',
  'Messenger-ready handoff for dine-in, pick-up, and delivery orders.',
  'Mobile-first ordering flow with fewer dead ends and fewer drop-offs.',
  'Clear product hierarchy so your best offers stand out immediately.',
] as const

const BLUEPRINTS = [
  {
    icon: LayoutGrid,
    title: 'Menu Curation Blueprint',
    description:
      'Inaayos natin ang sequence ng menu para ang tamang items ang unang mapansin.',
    result: 'Better visibility for high-margin categories',
  },
  {
    icon: BarChart3,
    title: 'Menu Engineering Blueprint',
    description:
      'Makikita mo kung alin ang star products, margin drivers, at dead-weight items.',
    result: 'Smarter decisions on what to push',
  },
  {
    icon: Smartphone,
    title: 'App Selling System Blueprint',
    description:
      'The ordering flow stops acting like a catalog and starts acting like a guided sales path.',
    result: 'Cleaner decisions and fewer low-value baskets',
  },
  {
    icon: Package,
    title: 'Bundling System',
    description:
      'Gagawa tayo ng bundle prompts at meal upgrades na natural sa customer journey.',
    result: 'Higher average order value without extra staff effort',
  },
] as const

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Audit',
    description:
      'We review your current menu and spot where you are losing bundles, upgrades, and clarity.',
  },
  {
    number: '02',
    title: 'Build',
    description:
      'We restructure the funnel, rewrite the key prompts, and shape the menu around conversion.',
  },
  {
    number: '03',
    title: 'Launch',
    description:
      'Customers get a cleaner ordering experience while Messenger receives the order in real time.',
  },
] as const

const VALUE_STACK_ITEMS = [
  {
    name: 'Smart Menu Ordering System (Dine-in + Pick-up + Delivery)',
    value: '10,000',
  },
  { name: 'Menu Curation Blueprint', value: '2,500' },
  { name: 'Menu Engineering Blueprint', value: '2,500' },
  { name: 'App Selling System Blueprint', value: '2,500' },
  { name: 'Bundling System', value: '2,500' },
] as const

const OUTCOMES = [
  {
    icon: ShoppingCart,
    title: 'Bigger baskets',
    text: 'Mas madaling tanggapin ang combos, add-ons, at meal upgrades kapag malinaw ang next step.',
  },
  {
    icon: LayoutGrid,
    title: 'Cleaner decisions',
    text: 'Hindi nalulunod ang customer sa menu. Alam nila kung saan magsisimula at ano ang susunod.',
  },
  {
    icon: MessageCircle,
    title: 'Faster handoff',
    text: 'Orders go straight into Messenger, so your team can respond without switching workflows.',
  },
  {
    icon: BarChart3,
    title: 'Better margin visibility',
    text: 'Mas obvious kung aling products at bundles ang dapat i-push para kumita ka nang mas maayos.',
  },
] as const

const FAQ_ITEMS = [
  {
    q: 'Para kanino itong funnel redesign?',
    a: 'Para sa restaurants, cafes, cloud kitchens, food trucks, and commissaries na gusto ng mas malaking basket size per order.',
  },
  {
    q: 'Kailangan ba ng technical skills sa side namin?',
    a: 'Hindi. We handle the build. Kailangan lang namin ang menu, offer context, at kung paano dumadating ang orders mo ngayon.',
  },
  {
    q: 'Messenger lang ba ang order destination?',
    a: 'Sa current landing page flow, oo. Ang design ay ginawa para clean ang handoff papunta sa Messenger mo.',
  },
  {
    q: 'Gaano kabilis puwedeng ma-setup?',
    a: 'Depende sa complexity ng menu, pero kadalasan mabilis itong ma-outline at ma-launch once complete ang inputs.',
  },
  {
    q: 'One-time payment lang ba ito?',
    a: 'Yes. The current offer is positioned as a one-time P3,499 setup with no monthly fee on the landing page.',
  },
  {
    q: 'Paano kung mahaba o komplikado ang menu namin?',
    a: 'Mas lalo itong kailangan ng structure. Categories, bundles, variations, and add-ons are exactly where guided selling helps most.',
  },
] as const

function SectionTag({
  children,
  dark = false,
}: {
  children: React.ReactNode
  dark?: boolean
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] ${
        dark
          ? 'border-white/10 bg-white/5 text-white/70'
          : 'border-black/10 bg-white text-[#2F251F]'
      }`}
    >
      <span
        className="h-2.5 w-2.5 rounded-full animate-pulse"
        style={{ backgroundColor: BRAND_RED }}
      />
      <span>{children}</span>
    </div>
  )
}

function PrimaryCTA({
  compact = false,
  mainText = PRIMARY_CTA,
  subText = PRIMARY_SUBCTA,
}: {
  compact?: boolean
  mainText?: string
  subText?: string
}) {
  return (
    <a
      href={MESSENGER_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative inline-flex w-full max-w-xl flex-col rounded-[1.75rem] text-white transition-transform duration-300 hover:-translate-y-0.5 ${
        compact ? 'px-6 py-4' : 'px-7 py-5'
      }`}
      style={{
        background: `linear-gradient(135deg, ${BRAND_RED} 0%, #D93025 100%)`,
        boxShadow: '0 24px 60px rgba(255, 59, 48, 0.28)',
      }}
    >
      <span className="absolute inset-0 rounded-[1.75rem] bg-black/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <span
        className={`relative flex items-center justify-center gap-3 text-center font-black uppercase tracking-[-0.03em] ${
          compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
        }`}
      >
        <MessageCircle className={compact ? 'h-4 w-4 shrink-0' : 'h-5 w-5 shrink-0'} />
        <span>{mainText}</span>
        <ChevronRight
          className={compact ? 'h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1' : 'h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1'}
        />
      </span>
      <span
        className={`relative mt-1.5 text-center leading-snug text-white/80 ${
          compact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm'
        }`}
      >
        {subText}
      </span>
    </a>
  )
}

function Navigation() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#110D0B]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: BRAND_RED }}
          >
            <Menu className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-white">
              WebNegosyo
            </div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
              Funnel Rebuild
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/65 transition-colors duration-200 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <a
            href={MESSENGER_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
          >
            <MessageCircle className="h-4 w-4" />
            Message Us
          </a>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white md:hidden"
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
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-4 lg:px-8">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <a
                href={MESSENGER_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: BRAND_RED }}
              >
                <MessageCircle className="h-4 w-4" />
                Message Us
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

function SocialProofStrip() {
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-center">
      {SOCIAL_PROOF.map((item) => {
        const Icon = item.icon

        return (
          <div
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 backdrop-blur-sm"
          >
            <Icon className="h-4 w-4 text-white/55" />
            <span>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function HeroReport() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div
        className="absolute inset-x-10 bottom-0 h-12 rounded-full blur-2xl"
        style={{ backgroundColor: `${BRAND_RED}55` }}
      />

      <div className="relative aspect-[0.8]">
        <div className="absolute left-0 top-12 h-[72%] w-[70%] rounded-[2rem] border border-white/10 bg-[#1A1411] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.38)]">
          <div className="rounded-[1.5rem] border border-white/10 bg-[#0F0B09] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">
              Inside the rebuild
            </div>
            <div className="mt-4 space-y-3">
              {['Bundle logic', 'Upgrade prompts', 'Messenger handoff'].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-sm text-white/75"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="absolute right-0 top-0 w-[76%] rounded-[2.4rem] p-[1px] shadow-[0_32px_80px_rgba(0,0,0,0.45)]"
          style={{
            background: `linear-gradient(160deg, #FF8A73 0%, ${BRAND_RED} 45%, #C6261A 100%)`,
          }}
        >
          <div className="rounded-[2.35rem] bg-[#120E0C] p-6">
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-white/75">
              Free Playbook
            </div>

            <div className="mt-10 text-[11px] font-bold uppercase tracking-[0.34em] text-white/45">
              WebNegosyo
            </div>

            <h3 className="mt-4 text-[2rem] font-black uppercase leading-[0.92] tracking-[-0.06em] text-white">
              Smart Menu
              <br />
              Growth
              <br />
              Blueprint
            </h3>

            <div className="mt-8 space-y-2">
              {['Guide bigger orders', 'Push better bundles', 'Sell without extra staff'].map(
                (item) => (
                  <div
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-white/80"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: BRAND_RED }}
                    />
                    <span>{item}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <div className="absolute bottom-3 left-6 max-w-[220px] rounded-[1.6rem] border border-black/10 bg-[#FFF6E7] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#7A6357]">
            Included
          </div>
          <div className="mt-2 text-base font-black uppercase leading-none tracking-[-0.04em] text-[#231A15]">
            4 blueprints
            <br />
            + smart menu system
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28 lg:pt-40"
      style={{ backgroundColor: DARK_BG }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 h-[480px] w-[780px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ backgroundColor: `${BRAND_RED}20` }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              'linear-gradient(180deg, rgba(17,13,11,0) 0%, rgba(17,13,11,0.88) 100%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <SectionTag dark>Open Letter For Food Business Owners</SectionTag>

          <h1 className="mt-6 text-[3rem] font-black uppercase leading-[0.9] tracking-[-0.07em] text-white sm:text-[4.4rem] lg:text-[6.1rem]">
            Turn your menu into a sales system that pushes bigger orders
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/72 md:text-xl">
            Hindi sapat na maganda lang ang menu. Kailangan nitong marunong
            mag-guide, mag-suggest, at mag-push ng better orders bago pa
            dumating sa Messenger ang checkout.
          </p>

          <SocialProofStrip />
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <HeroReport />

          <div className="rounded-[2rem] border border-white/10 bg-white/6 p-7 text-white shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-md md:p-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
              What we will map on the call
            </div>

            <div className="mt-5 space-y-4">
              {[
                'Saan tumatagas ang average order value mo',
                'Aling bundles at upgrades ang dapat mauna sa flow',
                'How your menu should guide dine-in, pick-up, and delivery',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${BRAND_RED}25` }}
                  >
                    <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                  </div>
                  <p className="text-base leading-relaxed text-white/80">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <PrimaryCTA />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-white/45 sm:justify-start">
              <span>No spam</span>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>No pressure</span>
              <span className="h-1 w-1 rounded-full bg-white/25" />
              <span>Messenger only</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TraditionalMenuCard() {
  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.28em] text-[#8B7468]">
          Static menu
        </div>
        <div className="rounded-full bg-[#F6E4DF] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#A84432]">
          Old way
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {[
          ['Chicken Adobo', 'P150'],
          ['Pork Sisig', 'P175'],
          ['Pancit Canton', 'P120'],
          ['Iced Tea', 'P45'],
        ].map(([name, price]) => (
          <div
            key={name}
            className="flex items-center justify-between border-b border-dashed border-[#E7D8C6] pb-3 text-[#5D4B41]"
          >
            <span>{name}</span>
            <span>{price}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-2 text-sm text-[#8B7468]">
        <div className="flex items-center gap-2">
          <X className="h-4 w-4 text-[#B79C8D]" />
          <span>No upsell guidance</span>
        </div>
        <div className="flex items-center gap-2">
          <X className="h-4 w-4 text-[#B79C8D]" />
          <span>No bundles highlighted</span>
        </div>
        <div className="flex items-center gap-2">
          <X className="h-4 w-4 text-[#B79C8D]" />
          <span>Customer decides alone</span>
        </div>
      </div>
    </div>
  )
}

function SellingMenuCard() {
  return (
    <div className="rounded-[2rem] border border-black/10 bg-[#18120F] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.28em] text-white/45">
          Selling menu
        </div>
        <div
          className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white"
          style={{ backgroundColor: BRAND_RED }}
        >
          Better way
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.1em]">
                Chicken meal
              </div>
              <div className="mt-1 text-sm text-white/65">
                Best margin + best seller
              </div>
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white/80">
              Star
            </div>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-white/10 bg-[#231A16] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.26em] text-white/45">
            Suggested next step
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Make it a meal
              </div>
              <div className="text-sm text-green-300">Add rice + iced tea</div>
            </div>
            <div
              className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-white"
              style={{ backgroundColor: BRAND_RED }}
            >
              Add
            </div>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.1em]">
                Family bundle
              </div>
              <div className="mt-1 text-sm text-white/65">
                Higher basket, clearer value
              </div>
            </div>
            <div className="rounded-full bg-green-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-green-300">
              Push
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2 text-sm text-white/72">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-300" />
          <span>Clear order path</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-300" />
          <span>Bundle prompts at the right moment</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-300" />
          <span>Guided higher-value choices</span>
        </div>
      </div>
    </div>
  )
}

function LetterSection() {
  return (
    <section
      id="why-it-works"
      className="relative py-20 md:py-28 lg:py-32"
      style={{ backgroundColor: PAPER_BG }}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.6 }}
          >
            <SectionTag>Why it works</SectionTag>

            <h2 className="mt-6 max-w-3xl text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] text-[#1D1612] md:text-5xl">
              Most menus are built like catalogs. Profitable menus behave like
              sales funnels.
            </h2>

            <div className="mt-8 max-w-3xl space-y-6 text-lg leading-relaxed text-[#5F4C40]">
              <p>
                Dear food business owner, if your menu is only listing items and
                prices, it is forcing your staff to do all the selling.
              </p>
              <p>
                Ang problema, hindi consistent ang tao. Kapag rush hour, ang
                team mo naka-focus sa bilis, hindi sa suggestive selling. Kaya
                nawawala ang drinks, add-ons, meal upgrades, at bundles na
                dapat sana kasama sa order.
              </p>
              <p>
                The strongest food brands do not leave that to chance. They
                design the menu so the next best decision is obvious. Iyon ang
                ginagawa ng smart menu funnel: it guides attention, sets the
                right default choices, and makes bigger orders feel natural.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col gap-6"
          >
            <div className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#8B7468]">
                Core idea
              </div>
              <p className="mt-5 text-2xl font-black uppercase leading-[0.96] tracking-[-0.04em] text-[#1E1713]">
                The menu should do the persuasion before the customer asks what
                else they can add.
              </p>
              <p className="mt-4 text-base leading-relaxed text-[#655347]">
                Hindi lang dapat informative ang funnel. It should guide,
                surface the profitable options, and remove the guesswork from
                ordering.
              </p>
            </div>

            <div
              className="rounded-[2rem] p-7 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)]"
              style={{
                background: `linear-gradient(145deg, ${INK} 0%, #241A15 100%)`,
              }}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
                What changes
              </div>
              <div className="mt-5 space-y-4">
                {[
                  'Your high-margin items get seen earlier.',
                  'Your bundles appear at the right decision points.',
                  'Your ordering flow feels easier while the basket gets bigger.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-300" />
                    <span className="text-base leading-relaxed text-white/78">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.55 }}
          >
            <TraditionalMenuCard />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.55, delay: 0.1 }}
          >
            <SellingMenuCard />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  return (
    <section
      className="relative py-20 md:py-28 lg:py-32"
      style={{ backgroundColor: DARK_BG }}
    >
      <div className="absolute inset-0 opacity-[0.04]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <SectionTag dark>Where revenue leaks</SectionTag>

          <h2 className="mt-6 text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] text-white md:text-5xl">
            Static menus leak money a little bit at a time - on almost every
            order.
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-white/68">
            Hindi mo kailangan ng mas maraming traffic para kumita nang mas
            maayos. Kailangan mo ng menu na mas mahusay magbenta sa existing
            traffic mo.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PAIN_POINTS.map((point, index) => {
            const Icon = point.icon

            return (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${BRAND_RED}18` }}
                >
                  <Icon className="h-6 w-6" style={{ color: BRAND_RED }} />
                </div>

                <h3 className="mt-6 text-xl font-black uppercase leading-tight tracking-[-0.03em] text-white">
                  {point.title}
                </h3>

                <p className="mt-4 text-base leading-relaxed text-white/68">
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

function SystemPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[430px]">
      <div
        className="absolute -inset-6 rounded-[2.4rem] blur-3xl"
        style={{ backgroundColor: `${BRAND_RED}18` }}
      />

      <div className="relative rounded-[2.4rem] border border-black/10 bg-[#17110E] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.22)]">
        <div className="rounded-[1.9rem] bg-white p-4">
          <div className="flex items-center justify-between border-b border-[#EFE3D4] pb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#8B7468]">
                Smart menu flow
              </div>
              <div className="mt-1 text-lg font-black uppercase tracking-[-0.03em] text-[#221A15]">
                Kusina ni Maria
              </div>
            </div>
            <div
              className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
              style={{ backgroundColor: BRAND_RED }}
            >
              Live
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-[1.2rem] border border-[#EDE0D0] bg-[#FFF7ED] p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#8B7468]">
                Start here
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {['Dine-in', 'Pick-up', 'Delivery'].map((item, index) => (
                  <div
                    key={item}
                    className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold ${
                      index === 0
                        ? 'border-[#FF3B30] bg-[#FFF0ED] text-[#241A15]'
                        : 'border-[#E9DCCD] text-[#6A564A]'
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-[#EDE0D0] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-black uppercase tracking-[-0.02em] text-[#211813]">
                    Chicken Inasal Meal
                  </div>
                  <div className="mt-1 text-sm text-[#6C584C]">
                    Best seller with strong margin
                  </div>
                </div>
                <div className="text-sm font-black text-[#FF3B30]">P189</div>
              </div>
            </div>

            <div className="rounded-[1.2rem] bg-[#17120F] p-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/45">
                Suggested upgrade
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Add rice + iced tea</div>
                  <div className="text-sm text-green-300">Increase basket value</div>
                </div>
                <div
                  className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]"
                  style={{ backgroundColor: BRAND_RED }}
                >
                  Add
                </div>
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-[#EDE0D0] bg-[#F7FBFF] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F0FF]">
                  <MessageCircle className="h-5 w-5 text-[#2563EB]" />
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-[-0.02em] text-[#221A15]">
                    Messenger handoff
                  </div>
                  <div className="text-sm text-[#6C584C]">
                    Order lands directly in your inbox
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OfferSection() {
  return (
    <section
      id="what-you-get"
      className="relative py-20 md:py-28 lg:py-32"
      style={{ backgroundColor: PAPER_BG }}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <SectionTag>What you get</SectionTag>

          <h2 className="mt-6 text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] text-[#1D1612] md:text-5xl">
            This is not a reskin. It is a funnel redesign for the full ordering
            experience.
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#5F4C40]">
            You are not buying a prettier menu. You are installing a guided
            system that changes what customers notice, what they click next, and
            what lands in the basket.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <div className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#8B7468]">
                Inside the playbook
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {PLAYBOOK_ITEMS.map((item, index) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT}
                    transition={{ duration: 0.45, delay: index * 0.04 }}
                    className="rounded-[1.4rem] border border-[#EEE2D3] bg-[#FFFAF5] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${BRAND_RED}18` }}
                      >
                        <Check className="h-4 w-4" style={{ color: BRAND_RED }} />
                      </div>
                      <p className="text-sm leading-relaxed text-[#5F4C40]">
                        {item}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {BLUEPRINTS.map((item, index) => {
                const Icon = item.icon

                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 26 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT}
                    transition={{ duration: 0.45, delay: index * 0.06 }}
                    className="rounded-[1.8rem] border border-black/10 bg-white p-6 shadow-[0_16px_45px_rgba(0,0,0,0.06)]"
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: `${BRAND_RED}14` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: BRAND_RED }} />
                    </div>

                    <h3 className="mt-5 text-xl font-black uppercase leading-tight tracking-[-0.03em] text-[#1F1713]">
                      {item.title}
                    </h3>

                    <p className="mt-3 text-base leading-relaxed text-[#5F4C40]">
                      {item.description}
                    </p>

                    <div className="mt-4 inline-flex rounded-full bg-[#F5E9D8] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#7A6357]">
                      {item.result}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col justify-between gap-8"
          >
            <SystemPreview />

            <div
              className="rounded-[2rem] p-7 text-white shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
              style={{
                background: `linear-gradient(145deg, ${INK} 0%, #241A15 100%)`,
              }}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
                Why this matters
              </div>

              <p className="mt-5 text-2xl font-black uppercase leading-[0.96] tracking-[-0.04em]">
                Your menu starts selling even when your staff are busy.
              </p>

              <p className="mt-4 text-base leading-relaxed text-white/72">
                The funnel handles the guidance. The prompts appear at the right
                time. The order lands where your team already works. That is the
                shift.
              </p>

              <div className="mt-6">
                <PrimaryCTA
                  compact
                  mainText="See How This Fits My Menu"
                  subText="Messenger us and we will map the best entry point for your current offer stack."
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function ProcessAndPricingSection() {
  return (
    <section
      id="pricing"
      className="relative py-20 md:py-28 lg:py-32"
      style={{ backgroundColor: DARK_BG }}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <SectionTag dark>How it rolls out</SectionTag>

          <h2 className="mt-6 text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] text-white md:text-5xl">
            Three steps from price list to guided ordering system.
          </h2>
        </motion.div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PROCESS_STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-white shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
            >
              <div className="text-4xl font-black uppercase tracking-[-0.06em] text-white/24">
                {step.number}
              </div>
              <h3 className="mt-6 text-2xl font-black uppercase leading-tight tracking-[-0.03em]">
                {step.title}
              </h3>
              <p className="mt-4 text-base leading-relaxed text-white/68">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.55 }}
            className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-white shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
              Built for actual ordering
            </div>

            <h3 className="mt-5 text-3xl font-black uppercase leading-[0.94] tracking-[-0.04em]">
              The funnel is designed around how food customers really decide.
            </h3>

            <div className="mt-6 space-y-4">
              {[
                'Fast choices first, better-value choices second.',
                'Bundle logic that feels natural on mobile.',
                'Messenger handoff so the team keeps one familiar workflow.',
                'Offer presentation tuned for dine-in, pick-up, and delivery.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-300" />
                  <span className="text-base leading-relaxed text-white/72">
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
              <div className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">
                Payback logic
              </div>
              <p className="mt-3 text-base leading-relaxed text-white/72">
                One or two stronger bundles can cover the setup quickly if the
                funnel keeps steering customers toward better baskets.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-white shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
              Everything included
            </div>

            <div className="mt-6 divide-y divide-white/10">
              {VALUE_STACK_ITEMS.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 py-5"
                >
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 shrink-0 text-green-300" />
                    <span className="text-base text-white/78">{item.name}</span>
                  </div>
                  <span className="shrink-0 text-base text-white/40 line-through">
                    P{item.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/10 pt-6">
              <span className="text-2xl font-black uppercase tracking-[-0.03em]">
                Total value
              </span>
              <span className="text-2xl font-black uppercase tracking-[-0.03em]">
                P20,000+
              </span>
            </div>

            <div className="mt-10 rounded-[1.8rem] bg-white p-7 text-[#1D1612]">
              <div className="text-sm font-medium text-[#7A6357]">
                Pero hindi mo babayaran ng ganun.
              </div>
              <div className="mt-3 text-5xl font-black uppercase leading-none tracking-[-0.05em]">
                <span style={{ color: BRAND_RED }}>P3,499</span>
              </div>
              <div className="mt-3 text-sm uppercase tracking-[0.22em] text-[#7A6357]">
                One-time setup
              </div>

              <div className="mt-6">
                <PrimaryCTA
                  compact
                  mainText="Book My Free Strategy Call"
                  subText="We will walk through your current menu and show where the biggest funnel gains should come from."
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function OutcomesSection() {
  return (
    <section
      className="relative py-20 md:py-28 lg:py-32"
      style={{ backgroundColor: SAND_BG }}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <SectionTag>Expected outcomes</SectionTag>

          <h2 className="mt-6 text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] text-[#1D1612] md:text-5xl">
            What a smarter menu changes after launch.
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[#5F4C40]">
            The point of the redesign is simple: clearer decisions for the
            customer, better basket quality for the business.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {OUTCOMES.map((item, index) => {
            const Icon = item.icon

            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${BRAND_RED}14` }}
                >
                  <Icon className="h-5 w-5" style={{ color: BRAND_RED }} />
                </div>

                <h3 className="mt-5 text-xl font-black uppercase leading-tight tracking-[-0.03em] text-[#1F1713]">
                  {item.title}
                </h3>

                <p className="mt-3 text-base leading-relaxed text-[#5F4C40]">
                  {item.text}
                </p>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="mt-12 rounded-[2rem] border border-black/10 bg-[#1A1411] px-6 py-7 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)] md:px-8"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/45">
                Bottom line
              </div>
              <p className="mt-3 max-w-2xl text-xl font-black uppercase leading-[0.98] tracking-[-0.03em]">
                The redesign is meant to increase the quality of each order, not
                just the look of the page.
              </p>
            </div>

            <div className="w-full md:w-auto">
              <PrimaryCTA
                compact
                mainText="Review My Current Menu"
                subText="Send us a message and we will map the biggest funnel opportunities first."
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="bg-white py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <SectionTag>FAQ</SectionTag>

          <h2 className="mt-6 text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] text-[#1D1612] md:text-5xl">
            Questions people ask before they rebuild the funnel.
          </h2>
        </motion.div>

        <div className="mt-14 divide-y divide-[#E8D9C9] rounded-[2rem] border border-black/10 bg-[#FFF9F2] px-6 shadow-[0_16px_45px_rgba(0,0,0,0.05)] md:px-8">
          {FAQ_ITEMS.map((item, index) => (
            <motion.div
              key={item.q}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.42, delay: index * 0.04 }}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between gap-4 py-6 text-left"
                aria-expanded={openIndex === index}
              >
                <span className="text-lg font-black uppercase leading-tight tracking-[-0.02em] text-[#1D1612]">
                  {item.q}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-[#7A6357] transition-transform duration-200 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 text-base leading-relaxed text-[#5F4C40]">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTASection() {
  return (
    <section
      className="relative overflow-hidden py-20 md:py-28 lg:py-32"
      style={{ backgroundColor: DARK_BG }}
    >
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 text-center lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
        >
          <SectionTag dark>Final CTA</SectionTag>

          <h2 className="mt-6 text-4xl font-black uppercase leading-[0.9] tracking-[-0.06em] text-white md:text-6xl">
            If your menu is not guiding the next best order, it is leaving
            money behind.
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/68 md:text-xl">
            Bawat araw na static lang ang menu mo, may upgrades at bundles na
            hindi nangyayari. The opportunity is already in front of you. The
            funnel just needs to be rebuilt to capture it.
          </p>

          <div className="mt-10 flex justify-center">
            <PrimaryCTA />
          </div>

          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-4 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
            <span>Free strategy call</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Messenger handoff</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>One-time setup offer</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[#0C0908] py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-center lg:flex-row lg:px-8 lg:text-left">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: BRAND_RED }}
          >
            <Menu className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-white">
              WebNegosyo
            </div>
            <div className="text-xs text-white/42">
              Copyright {new Date().getFullYear()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5 text-sm text-white/45">
          <a href="#" className="transition-colors duration-200 hover:text-white/75">
            Privacy
          </a>
          <a href="#" className="transition-colors duration-200 hover:text-white/75">
            Terms
          </a>
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: DARK_BG }}>
      <Navigation />
      <HeroSection />
      <LetterSection />
      <ProblemSection />
      <OfferSection />
      <ProcessAndPricingSection />
      <OutcomesSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </div>
  )
}
