import Image from 'next/image'
import { Lightbulb } from 'lucide-react'
import { LANDING_PHOTOS, SMARTMENU } from '@/components/landing/landing-theme'
import { BIG_DOMINO, HOOK, PROBLEM, STORY } from './funnel-copy'
import { FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

/**
 * Star-Story-Solution, step one: a pattern interrupt of core-desire questions
 * the owner answers "yes" to, then the agitation of what it costs today.
 */
export function FunnelHook() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: SMARTMENU.red }}>
          {HOOK.eyebrow}
        </p>
        <ul className="mt-6 space-y-3">
          {HOOK.questions.map((question) => (
            <li
              key={question}
              className="rounded-2xl px-5 py-4 text-lg font-extrabold leading-snug sm:text-xl"
              style={{ backgroundColor: FUNNEL_TINT, color: SMARTMENU.ink, border: `1px solid ${FUNNEL_LINE}` }}
            >
              {question}
            </li>
          ))}
        </ul>
        <div className="mt-8 space-y-4">
          {HOOK.agitate.map((paragraph) => (
            <p key={paragraph} className="text-[16px] leading-relaxed sm:text-lg" style={{ color: SMARTMENU.ink }}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The three leaks, then the Big Lie: it was never the owner's fault. */
export function FunnelProblem() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-24" style={{ backgroundColor: FUNNEL_TINT }}>
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow={PROBLEM.eyebrow} title={PROBLEM.title} subtitle={PROBLEM.intro} />

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEM.leaks.map((leak, index) => (
            <li key={leak.title} className="rounded-2xl bg-white p-6" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
                style={{ backgroundColor: `${SMARTMENU.red}14`, color: SMARTMENU.red }}
              >
                {index + 1}
              </span>
              <h3 className="mt-4 text-lg font-extrabold leading-snug" style={{ color: SMARTMENU.ink }}>
                {leak.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
                {leak.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-6 sm:p-8" style={{ border: `2px solid ${SMARTMENU.ink}` }}>
          <h3 className="text-xl font-extrabold leading-snug sm:text-2xl" style={{ color: SMARTMENU.ink }}>
            {PROBLEM.bigLieTitle}
          </h3>
          <div className="mt-3 space-y-3">
            {PROBLEM.bigLie.map((paragraph) => (
              <p key={paragraph} className="text-[15.5px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.cocoa }}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The Epiphany Bridge told as one continuous story (backstory → wall →
 * epiphany → plan → transformation, never labelled), ending on the Big
 * Domino: the one belief that makes every objection moot.
 */
export function FunnelOrigin() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow={STORY.eyebrow} title={STORY.title} />

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
          <div className="space-y-5">
            {STORY.paragraphs.map((paragraph, index) => (
              <p
                key={paragraph}
                className={`leading-relaxed ${index === 0 ? 'text-lg font-semibold sm:text-xl' : 'text-[16px] sm:text-[17px]'}`}
                style={{ color: SMARTMENU.ink }}
              >
                {paragraph}
              </p>
            ))}
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-lg lg:sticky lg:top-24">
            <Image
              src={LANDING_PHOTOS.interior.src}
              alt={LANDING_PHOTOS.interior.alt}
              fill
              sizes="(min-width: 1024px) 460px, 100vw"
              className="object-cover"
            />
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-4xl rounded-3xl p-6 text-center sm:p-10" style={{ backgroundColor: SMARTMENU.ink }}>
          <p
            className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: SMARTMENU.amber }}
          >
            <Lightbulb aria-hidden className="h-4 w-4" />
            {BIG_DOMINO.eyebrow}
          </p>
          <p className="t-funnel-h2 mt-4 text-balance font-extrabold leading-[1.12] tracking-tight text-white">
            {BIG_DOMINO.statement}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed sm:text-lg" style={{ color: SMARTMENU.parchment }}>
            {BIG_DOMINO.bridge}
          </p>
        </div>
      </div>
    </section>
  )
}
