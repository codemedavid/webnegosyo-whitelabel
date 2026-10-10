import Image from 'next/image'
import { landingFontClass } from '@/components/landing/landing-fonts'

/** The set-up pages' frame (`/onboarding/...`): white ground, wordmark, a way to reach us. */

export const ONBOARDING_HELP_URL = 'https://m.me/WebNegosyoOfficial'
const INK = '#17130F'
const MUTED = '#5C544D'

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${landingFontClass} min-h-dvh bg-white antialiased`} style={{ fontFamily: 'var(--font-landing-text), system-ui, sans-serif', color: INK }}>
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <span className="flex items-center gap-2">
          <Image src="/smartmenu-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-[17px] font-bold tracking-tight" style={{ fontFamily: 'var(--font-landing-display), system-ui' }}>SmartMenu</span>
        </span>
        <a
          href={ONBOARDING_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#F6F4F1]"
          style={{ borderColor: '#E9E5E0' }}
        >
          Questions?
        </a>
      </header>
      {children}
    </main>
  )
}

export function OnboardingNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-balance text-2xl font-extrabold tracking-[-0.02em]" style={{ color: INK }}>{title}</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>{body}</p>
      <a href={ONBOARDING_HELP_URL} target="_blank" rel="noopener noreferrer"
        className="mt-8 inline-flex min-h-12 items-center rounded-xl px-6 text-[15px] font-semibold text-white" style={{ backgroundColor: INK }}>
        Message us on Facebook
      </a>
    </div>
  )
}
