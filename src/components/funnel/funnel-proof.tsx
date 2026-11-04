import Image from 'next/image'
import { PROOF } from './funnel-copy'
import { SectionTitle } from './funnel-ui'

/** The SmartMenu product demo (v3, 2:12), served from the R2 media host. */
const DEMO_VIDEO = {
  src: 'https://media.webnegosyo.com/marketing/smartmenu-product-demo-v3.mp4',
  poster: 'https://media.webnegosyo.com/marketing/smartmenu-product-demo-v3-poster.jpg',
} as const

/** Beracah Cafe's owner on camera beside their ordering screen (vertical, 0:47). */
const BERACAH_VIDEO = {
  src: 'https://media.webnegosyo.com/marketing/beracah-cafe-testimonial.mp4',
  poster: 'https://media.webnegosyo.com/marketing/beracah-cafe-testimonial-poster.jpg',
  name: 'Fernando San Juan',
  business: 'Beracah Cafe',
} as const

/**
 * Transcribed word for word from merchants' Messenger messages (screenshots
 * the owner shared, 2026-11-04). Only the praise is quoted: one message also
 * asks about Apple printer support, another about a room-booking site.
 */
const MESSENGER_MESSAGES = [
  { quote: 'nag relaunch kami now, mas manageable na kasi ang bagong updates sa app. this is way better sa previous versions', from: 'Merchant' },
  { quote: 'malaking tulong yung platform actually', from: 'Merchant' },
  { quote: 'Sobrang ganda ng gawa mo', from: 'Chona' },
] as const

/** Transcribed from /testimonial2.png, the merchant's real Facebook recommendation. */
const FACEBOOK_REVIEW = {
  quote:
    'They know what they’re doing. They communicate well. Hope this web developer helps more businesses like ours. Kudos to the team. It’s nice doing business with you.',
  name: 'Kenya Mendoza - Sabale',
  source: 'Facebook recommendation, Aug 23, 2025',
} as const

/**
 * Proof uses only what is real: the product demo, two merchants' videos,
 * their own messages and a Facebook review. No invented star ratings or review counts.
 */
export function FunnelProof() {
  return (
    <section id="proof" className="scroll-mt-20 px-5 py-20">
      <div className="mx-auto max-w-[860px]">
        <SectionTitle kicker={PROOF.eyebrow} title={PROOF.title} />

        <figure id="demo" className="mx-auto mt-12 max-w-[720px] scroll-mt-24">
          <video
            src={DEMO_VIDEO.src}
            poster={DEMO_VIDEO.poster}
            controls
            playsInline
            preload="metadata"
            className="fn-shot aspect-video w-full bg-black object-contain"
            aria-label="SmartMenu product demo"
          />
          <figcaption className="mt-3 text-center text-[13px] text-[#A99C8D]">{PROOF.demoTitle}</figcaption>
        </figure>

        <div className="mt-12 grid gap-4 md:grid-cols-[320px_1fr]">
          <figure className="mx-auto w-full max-w-[320px]">
            <video
              src={BERACAH_VIDEO.src}
              poster={BERACAH_VIDEO.poster}
              controls
              playsInline
              preload="none"
              className="fn-shot aspect-[9/16] w-full bg-black object-cover"
              aria-label={`${BERACAH_VIDEO.name} of ${BERACAH_VIDEO.business}, video testimonial`}
            />
            <figcaption className="mt-3 text-center text-[13px] text-[#A99C8D]">
              <span className="font-semibold text-white">{BERACAH_VIDEO.name}</span> · {BERACAH_VIDEO.business}
            </figcaption>
          </figure>
          <div className="flex flex-col justify-center gap-4">
            {MESSENGER_MESSAGES.map((m) => (
              <figure key={m.quote} className="fn-card p-5">
                <blockquote className="text-[17px] leading-relaxed text-white">“{m.quote}”</blockquote>
                <figcaption className="mt-3 text-[13px] text-[#A99C8D]">
                  <span className="font-semibold text-white">{m.from}</span> · {PROOF.messengerSource}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
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
