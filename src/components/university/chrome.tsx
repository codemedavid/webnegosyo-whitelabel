import Image from 'next/image'
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { BRAND, SMARTMENU } from '@/components/landing/landing-theme'
import { landingFontClass } from '@/components/landing/landing-fonts'

/**
 * The University's own stylesheet: the landing brand voices on a cream page,
 * scoped under .university-world so nothing leaks into tenant storefronts.
 */
const UNIVERSITY_STYLES = `
.university-world {
  font-family: var(--font-landing-text), 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: ${SMARTMENU.ink};
  background-color: ${SMARTMENU.cream};
  min-height: 100vh;
}
.university-world .font-display {
  font-family: var(--font-landing-display), 'Segoe UI', system-ui, sans-serif;
}
.university-world .font-serif {
  font-family: var(--font-landing-serif), Georgia, serif;
}
.university-world .t-hero { font-size: clamp(2.2rem, 5.2vw, 3.8rem); line-height: 1.05; }
.university-world .t-title { font-size: clamp(1.7rem, 3.4vw, 2.6rem); line-height: 1.1; }
.university-world .prose-lesson p { margin: 0 0 1.1em; line-height: 1.75; }
.university-world .prose-lesson p:last-child { margin-bottom: 0; }
.university-world .graph {
  background-image:
    linear-gradient(${SMARTMENU.ink}0A 1px, transparent 1px),
    linear-gradient(90deg, ${SMARTMENU.ink}0A 1px, transparent 1px);
  background-size: 28px 28px;
}
/* A lesson pins a bar over the bottom of a phone's screen; the footer then
   keeps clear of it, so its links are never stuck underneath. */
@media (max-width: 1023px) {
  .university-world:has(.lesson-nav-bar) .university-footer {
    padding-bottom: calc(7rem + env(safe-area-inset-bottom));
  }
}
.university-world .sheet-rise { animation: sheet-rise 220ms cubic-bezier(0.22, 1, 0.36, 1); }
.university-world .sheet-fade { animation: sheet-fade 180ms ease-out; }
@keyframes sheet-rise { from { transform: translateY(12%); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }
@keyframes sheet-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .university-world * { transition: none !important; animation: none !important; }
}
`

/** Page frame: brand fonts, cream ground, the University nav and footer. */
export function UniversityShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`university-world ${landingFontClass}`}>
      <style>{UNIVERSITY_STYLES}</style>
      <UniversityNav />
      <main>{children}</main>
      <UniversityFooter />
    </div>
  )
}

function UniversityNav() {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ backgroundColor: `${SMARTMENU.cream}F2`, borderColor: `${SMARTMENU.ink}14`, backdropFilter: 'blur(10px)' }}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5 md:h-16 md:px-8">
        <Link href="/university" className="flex shrink-0 items-center gap-2.5">
          <Image src={BRAND.logoSrc} alt="SmartMenu logo" width={38} height={38} className="h-8 w-8 rounded-full md:h-[38px] md:w-[38px]" priority />
          <span className="leading-tight">
            <span className="font-display block text-[15px] font-bold md:text-[17px]" style={{ color: SMARTMENU.ink }}>
              Smart<span style={{ color: SMARTMENU.red }}>Menu</span> University
            </span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] sm:block" style={{ color: SMARTMENU.cocoa }}>
              {BRAND.byline}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-5">
          <Link href="/university" className="hidden text-sm font-semibold transition-opacity hover:opacity-70 sm:inline" style={{ color: SMARTMENU.cocoa }}>
            All courses
          </Link>
          <Link href="/support" className="hidden text-sm font-semibold transition-opacity hover:opacity-70 sm:inline" style={{ color: SMARTMENU.cocoa }}>
            Support
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: SMARTMENU.red, boxShadow: `0 12px 24px -12px ${SMARTMENU.red}B3` }}
          >
            SmartMenu
          </Link>
        </div>
      </nav>
    </header>
  )
}

function UniversityFooter() {
  return (
    <footer className="mt-14 md:mt-20" style={{ backgroundColor: SMARTMENU.ink, color: SMARTMENU.parchment }}>
      <div className="university-footer mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: SMARTMENU.amber }}>
            <GraduationCap className="h-5 w-5" style={{ color: SMARTMENU.ink }} />
          </span>
          <div>
            <p className="font-display text-lg font-bold text-white">SmartMenu University</p>
            <p className="font-serif text-sm italic">{BRAND.tagline}</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/" className="transition-opacity hover:opacity-70">SmartMenu</Link>
          <Link href="/support" className="transition-opacity hover:opacity-70">Support</Link>
          <Link href="/privacy" className="transition-opacity hover:opacity-70">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}
