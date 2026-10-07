import Image from 'next/image'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { PROOF } from './funnel-copy'
import { FUNNEL_DAILY_PRICE } from './funnel-offer'
import { FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

/** Standing figures: the values are facts kept in code; only the labels are copy. */
const PROOF_STATS = [
  { value: '100+', label: PROOF.statLabels[0] },
  { value: '48 hrs', label: PROOF.statLabels[1] },
  { value: '0%', label: PROOF.statLabels[2] },
  { value: `₱${FUNNEL_DAILY_PRICE}`, label: PROOF.statLabels[3] },
] as const

const DEMO_VIDEO_URL = 'https://www.youtube.com/embed/q1GZEDwFLv8?rel=0'

/** Transcribed from /testimonial2.png, the merchant's real Facebook recommendation. */
const FACEBOOK_REVIEW = {
  quote:
    'They know what they’re doing. They communicate well. Hope this web developer helps more businesses like ours. Kudos to the team. It’s nice doing business with you.',
  name: 'Kenya Mendoza - Sabale',
  source: 'Facebook recommendation, Aug 23, 2025',
} as const

/**
 * Proof uses only what is real: the product demo, a merchant's video, two
 * review screenshots, and the standing figures from the main landing page.
 * No invented star ratings or review counts.
 */
export function FunnelProof() {
  return (
    <section id="proof" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24" style={{ backgroundColor: FUNNEL_TINT }}>
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow={PROOF.eyebrow} title={PROOF.title} subtitle={PROOF.subtitle} />

        <ul className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {PROOF_STATS.map((stat) => (
            <li key={stat.label} className="rounded-2xl bg-white p-4 sm:p-5" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
              <p className="text-2xl font-extrabold tabular-nums sm:text-3xl" style={{ color: SMARTMENU.red }}>
                {stat.value}
              </p>
              <p className="mt-1 text-[13px] leading-snug" style={{ color: SMARTMENU.cocoa }}>
                {stat.label}
              </p>
            </li>
          ))}
        </ul>

        <div id="demo" className="mx-auto mt-14 max-w-3xl scroll-mt-24">
          <h3 className="text-center text-lg font-extrabold" style={{ color: SMARTMENU.ink }}>
            {PROOF.demoTitle}
          </h3>
          <div className="relative mt-4 aspect-video overflow-hidden rounded-2xl shadow-lg" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
            <iframe
              src={DEMO_VIDEO_URL}
              title="SmartMenu demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl items-center gap-6 md:grid-cols-2">
          <video
            src="/testimonial-720.mp4"
            poster="/testimonial-poster.jpg"
            controls
            playsInline
            preload="none"
            className="aspect-square w-full rounded-2xl bg-black object-cover shadow-lg"
            aria-label={PROOF.videoLabel}
          />
          <ReviewShot src="/testimonial1.jpg" alt={PROOF.messageAlt} width={1080} height={1120} />
          <div className="hidden sm:contents">
            <ReviewShot
              src="/testimonial2.png"
              alt={PROOF.reviewAlt}
              width={1350}
              height={220}
              isWide
            />
          </div>
          {/* The screenshot is a 1350×220 strip: at phone width its text is ~4px, so phones get the same review as text. */}
          <figure className="rounded-2xl bg-white p-5 shadow-lg sm:hidden" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
            <blockquote className="text-[15px] leading-relaxed" style={{ color: SMARTMENU.ink }}>
              “{FACEBOOK_REVIEW.quote}”
            </blockquote>
            <figcaption className="mt-3 text-[13px]" style={{ color: SMARTMENU.cocoa }}>
              <strong style={{ color: SMARTMENU.ink }}>{FACEBOOK_REVIEW.name}</strong> · {FACEBOOK_REVIEW.source}
            </figcaption>
          </figure>
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-lg font-extrabold leading-snug sm:text-xl" style={{ color: SMARTMENU.red }}>
          {PROOF.trialClose}
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-center text-[12px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
          {PROOF.disclaimer}
        </p>
      </div>
    </section>
  )
}

/** A review screenshot. Wide ones (a Facebook review strip) take the full row at their own height. */
function ReviewShot({
  src,
  alt,
  width,
  height,
  isWide = false,
}: {
  src: string
  alt: string
  width: number
  height: number
  isWide?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-white p-4 shadow-lg ${isWide ? 'md:col-span-2' : 'aspect-square'}`}
      style={{ border: `1px solid ${FUNNEL_LINE}` }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={isWide ? '(min-width: 768px) 860px, 100vw' : '(min-width: 768px) 430px, 100vw'}
        className="max-h-full w-full object-contain"
      />
    </div>
  )
}
