import Image from 'next/image'
import Link from 'next/link'
import { BrandButton } from './landing-ui'
import { BRAND, CHECKOUT_URL, NAV_LINKS, SMARTMENU, SPONSOR_STRIP } from './landing-theme'

export function LandingNav() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: `${SMARTMENU.cream}F2`,
        borderColor: `${SMARTMENU.ink}14`,
        backdropFilter: 'blur(10px)',
      }}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image
            src={BRAND.logoSrc}
            alt="SmartMenu logo"
            width={40}
            height={40}
            className="rounded-full"
            priority
          />
          <span className="leading-tight">
            <span className="font-display block text-[17px] font-bold" style={{ color: SMARTMENU.ink }}>
              Smart<span style={{ color: SMARTMENU.red }}>Menu</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: SMARTMENU.cocoa }}>
              {BRAND.byline}
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-semibold transition-colors hover:opacity-70"
                style={{ color: SMARTMENU.cocoa }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <BrandButton href={CHECKOUT_URL}>Simulan</BrandButton>
      </nav>
    </header>
  )
}

/** The capability ribbon under the hero — an amber band that never stops moving. */
export function SponsorStrip() {
  return (
    <div
      className="relative overflow-hidden border-y py-3.5"
      style={{ backgroundColor: SMARTMENU.amber, borderColor: `${SMARTMENU.ink}22` }}
      aria-label="Mga kasamang feature"
    >
      <div className="marquee-track flex w-max items-center">
        {/* Duplicated once so the loop is seamless. */}
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1} className="flex items-center">
            {SPONSOR_STRIP.map((item) => (
              <li
                key={item}
                className="font-display flex items-center gap-6 whitespace-nowrap px-6 text-sm font-bold uppercase tracking-[0.08em]"
                style={{ color: SMARTMENU.ink }}
              >
                {item}
                <span aria-hidden className="text-base" style={{ color: SMARTMENU.red }}>
                  ✺
                </span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}

const FOOTER_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/support', label: 'Support' },
] as const

export function LandingFooter() {
  return (
    <footer style={{ backgroundColor: SMARTMENU.ink, color: SMARTMENU.parchment }}>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src={BRAND.logoSrc}
              alt="SmartMenu logo"
              width={44}
              height={44}
              className="rounded-full"
            />
            <span className="font-display text-xl font-bold text-white">
              Smart<span style={{ color: SMARTMENU.amber }}>Menu</span>
            </span>
          </div>
          <p className="font-serif mt-4 max-w-[30ch] text-lg italic" style={{ color: SMARTMENU.parchment }}>
            {BRAND.tagline}
          </p>
          <p className="mt-2 text-xs opacity-70">
            {BRAND.name} {BRAND.byline} — para sa mga food business sa Pilipinas.
          </p>
        </div>

        <nav aria-label="Landing sections">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: SMARTMENU.amber }}>
            Menu
          </p>
          <ul className="space-y-2.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm transition-opacity hover:opacity-70">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal at suporta">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: SMARTMENU.amber }}>
            Tulong
          </p>
          <ul className="space-y-2.5">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm transition-opacity hover:opacity-70">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={CHECKOUT_URL} className="text-sm font-semibold" style={{ color: SMARTMENU.amber }}>
                Kunin ang SmartMenu
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t py-5 text-center text-xs opacity-60" style={{ borderColor: '#FFFFFF1A' }}>
        © {new Date().getFullYear()} WebNegosyo. All rights reserved.
      </div>
    </footer>
  )
}
