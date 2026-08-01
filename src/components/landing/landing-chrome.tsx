import Image from 'next/image'
import Link from 'next/link'
import { CourtButton } from './court'
import { CHECKOUT_URL, COURT, NAV_LINKS, PRICE_LABEL, SPONSOR_STRIP, TARP } from './landing-theme'

/** The board's own header rail, pinned to the top of the court. */
export function LandingNav() {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50"
      style={{
        backgroundColor: 'rgba(7,10,8,0.93)',
        borderBottom: '1px solid rgba(237,232,218,0.1)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center overflow-hidden"
            style={{ backgroundColor: TARP.vinyl }}
          >
            <Image
              src="/webnegosyo-logo.png"
              alt=""
              width={36}
              height={36}
              className="scale-[1.7]"
              priority
            />
          </span>
          <span
            className="font-display text-sm uppercase leading-none tracking-[0.06em]"
            style={{ color: COURT.lane }}
          >
            WebNegosyo
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Landing sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="landing-navlink text-[11px] font-bold uppercase tracking-[0.16em]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href={CHECKOUT_URL}
          className="shrink-0 px-4 py-2.5 font-display text-[11px] uppercase leading-none tracking-[0.06em] transition-[filter,transform] duration-150 hover:brightness-110 active:translate-y-[2px] md:px-5 md:text-xs"
          style={{
            backgroundColor: COURT.plateRed,
            color: '#FFF6F3',
            clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            boxShadow: `0 4px 0 0 ${COURT.plateRedDeep}`,
          }}
        >
          Kunin — {PRICE_LABEL}
        </Link>
      </div>
    </header>
  )
}

/**
 * The sponsor tarpaulin strung along the court fence. Printed vinyl, so it is
 * bright against the asphalt — the page's first hard tonal break.
 */
export function SponsorStrip() {
  const row = [...SPONSOR_STRIP, ...SPONSOR_STRIP]

  return (
    <div
      className="relative z-10 overflow-hidden py-3.5"
      style={{
        backgroundColor: TARP.yellow,
        borderTop: `3px solid ${TARP.ink}`,
        borderBottom: `3px solid ${TARP.ink}`,
      }}
    >
      <div className="landing-strip flex w-max items-center">
        {row.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center whitespace-nowrap font-display text-sm uppercase tracking-[0.04em] md:text-base"
            style={{ color: TARP.ink }}
          >
            {item}
            <span
              aria-hidden
              className="mx-6 inline-block h-2 w-2"
              style={{ backgroundColor: TARP.red }}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

const FOOTER_LINKS = [
  ...NAV_LINKS,
  { href: '/privacy', label: 'Privacy' },
  { href: '/support', label: 'Support' },
] as const

export function LandingFooter() {
  return (
    <footer
      className="relative z-10 pb-14 pt-12"
      style={{ backgroundColor: '#070A08', borderTop: '3px solid rgba(237,232,218,0.14)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-7 px-5 text-center md:px-8">
        <span
          className="flex h-11 w-11 items-center justify-center overflow-hidden"
          style={{ backgroundColor: TARP.vinyl }}
        >
          <Image
            src="/webnegosyo-logo.png"
            alt="WebNegosyo"
            width={44}
            height={44}
            className="scale-[1.7]"
          />
        </span>

        <nav
          className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
          aria-label="Footer"
        >
          {FOOTER_LINKS.map((link) =>
            link.href.startsWith('#') ? (
              <a
                key={link.href}
                href={link.href}
                className="landing-navlink text-[11px] font-bold uppercase tracking-[0.16em]"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="landing-navlink text-[11px] font-bold uppercase tracking-[0.16em]"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <div className="pt-1">
          <CourtButton>Kunin ang Smart Menu — {PRICE_LABEL}</CourtButton>
        </div>

        <p className="text-xs" style={{ color: COURT.laneDim }}>
          WebNegosyo • Smart Menu System para sa food business • © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
