import Image from 'next/image'
import { PROOF } from './funnel-copy'
import { SectionTitle } from './funnel-ui'

const DEMO_VIDEO_URL = 'https://www.youtube.com/embed/q1GZEDwFLv8?rel=0'

/** Transcribed from /testimonial2.png, the merchant's real Facebook recommendation. */
const FACEBOOK_REVIEW = {
  quote:
    'They know what they’re doing. They communicate well. Hope this web developer helps more businesses like ours. Kudos to the team. It’s nice doing business with you.',
  name: 'Kenya Mendoza - Sabale',
  source: 'Facebook recommendation, Aug 23, 2025',
} as const

/**
 * Proof uses only what is real: the product demo, a merchant's video and two
 * reviews. No invented star ratings or review counts.
 */
export function FunnelProof() {
  return (
    <section id="proof" className="scroll-mt-20 px-5 py-20">
      <div className="mx-auto max-w-[860px]">
        <SectionTitle kicker={PROOF.eyebrow} title={PROOF.title} />

        <figure id="demo" className="mx-auto mt-12 max-w-[720px] scroll-mt-24">
          <div className="fn-shot relative aspect-video">
            <iframe
              src={DEMO_VIDEO_URL}
              title="SmartMenu demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <figcaption className="mt-3 text-center text-[13px] text-[#A99C8D]">{PROOF.demoTitle}</figcaption>
        </figure>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <video
            src="/testimonial-720.mp4"
            poster="/testimonial-poster.jpg"
            controls
            playsInline
            preload="none"
            className="fn-shot aspect-square w-full object-cover"
            aria-label={PROOF.videoLabel}
          />
          <div className="fn-shot relative aspect-square !bg-white">
            <Image src="/testimonial1.jpg" alt={PROOF.messageAlt} fill sizes="(min-width: 768px) 420px, 100vw" className="object-contain p-4" />
          </div>
          <figure className="fn-card p-6 md:col-span-2">
            <p className="fn-serif text-[44px] leading-none text-[#F5A623]" aria-hidden>“</p>
            <blockquote className="-mt-3 text-[17px] leading-relaxed text-white">{FACEBOOK_REVIEW.quote}</blockquote>
            <figcaption className="mt-4 text-[13px] text-[#A99C8D]">
              <span className="font-semibold text-white">{FACEBOOK_REVIEW.name}</span> · {FACEBOOK_REVIEW.source}
            </figcaption>
          </figure>
        </div>
        <p className="mx-auto mt-8 max-w-[600px] text-center text-[12px] leading-relaxed text-[#A99C8D]">{PROOF.disclaimer}</p>
      </div>
    </section>
  )
}
