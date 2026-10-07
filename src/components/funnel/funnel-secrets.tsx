import Image from 'next/image'
import { BarChart3, Repeat, Sparkles, Store, type LucideIcon } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { SECRETS } from './funnel-copy'
import { CheckMark, FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

/** One icon per secret, in order: the vehicle, the internal belief, the external belief. */
const SECRET_ICONS: readonly LucideIcon[] = [Store, Sparkles, Repeat]

type Secret = (typeof SECRETS.items)[number]

function SecretBlock({ secret, index }: { secret: Secret; index: number }) {
  const Icon = SECRET_ICONS[index] ?? Store
  const isReversed = index % 2 === 1
  return (
    <li className="grid gap-6 lg:grid-cols-2 lg:gap-12">
      <div className={isReversed ? 'lg:order-2' : undefined}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: SMARTMENU.red, color: '#FFF7EE' }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: SMARTMENU.red }}>
            {secret.label}
          </p>
        </div>
        <h3 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]" style={{ color: SMARTMENU.ink }}>
          {secret.title}
        </h3>
        <p className="mt-5 rounded-xl px-4 py-3 text-[15px] font-bold italic" style={{ backgroundColor: FUNNEL_TINT, color: SMARTMENU.cocoa }}>
          {secret.belief}
        </p>
        <div className="mt-4 space-y-3">
          {secret.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-[15.5px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.ink }}>
              {paragraph}
            </p>
          ))}
        </div>
        <p className="mt-5 text-[15px] font-extrabold" style={{ color: SMARTMENU.red }}>
          {secret.trialClose}
        </p>
      </div>

      <div
        className={`self-start rounded-2xl bg-white p-6 shadow-sm ${isReversed ? 'lg:order-1' : ''}`}
        style={{ border: `1px solid ${FUNNEL_LINE}` }}
      >
        <p className="text-lg font-extrabold leading-snug" style={{ color: SMARTMENU.ink }}>
          {secret.outcome}
        </p>
        <ul className="mt-4 space-y-4 border-t pt-4" style={{ borderColor: FUNNEL_LINE }}>
          {secret.tools.map((tool) => (
            <li key={tool.title} className="flex gap-2.5">
              <CheckMark />
              <div>
                <p className="font-bold leading-snug" style={{ color: SMARTMENU.ink }}>
                  {tool.title}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
                  {tool.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

/**
 * The Perfect Webinar's three secrets. Each one breaks a false belief
 * (vehicle, internal, external) and installs the lever that answers it.
 */
export function FunnelSecrets() {
  return (
    <section id="system" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow={SECRETS.eyebrow} title={SECRETS.title} subtitle={SECRETS.subtitle} />

        <ol className="mt-12 space-y-16 lg:space-y-20">
          {SECRETS.items.map((secret, index) => (
            <SecretBlock key={secret.label} secret={secret} index={index} />
          ))}
        </ol>

        <div
          className="mt-16 flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center"
          style={{ backgroundColor: FUNNEL_TINT, border: `1px solid ${FUNNEL_LINE}` }}
        >
          <BarChart3 aria-hidden className="h-7 w-7 shrink-0" style={{ color: SMARTMENU.amber }} />
          <div>
            <p className="font-extrabold" style={{ color: SMARTMENU.ink }}>
              {SECRETS.brainTitle}
            </p>
            <p className="mt-1 text-[14.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
              {SECRETS.brainBody}
            </p>
          </div>
        </div>

        <div
          className="relative mx-auto mt-10 aspect-[16/9] max-w-4xl overflow-hidden rounded-2xl shadow-lg"
          style={{ backgroundColor: SMARTMENU.cream }}
        >
          <Image
            src="/product.png"
            alt={SECRETS.productAlt}
            fill
            sizes="(min-width: 1024px) 900px, 100vw"
            className="object-contain p-4 sm:p-8"
          />
        </div>
      </div>
    </section>
  )
}
