'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { BrandButton, Eyebrow } from './landing-ui'
import { CHECKOUT_URL, PRICE_LABEL, SMARTMENU, STATS } from './landing-theme'

/** The four standing figures, set like prices on a printed menu board. */
export function StatsBand() {
  return (
    <section aria-label="Mga numero" className="px-5 py-14 md:px-8" style={{ backgroundColor: SMARTMENU.ink }}>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 md:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-2 px-4 text-center">
            <span className="flex items-baseline gap-1.5">
              <span
                className="font-serif text-5xl font-semibold tabular-nums md:text-6xl"
                style={{ color: SMARTMENU.amber }}
              >
                {stat.value}
              </span>
              {'unit' in stat && stat.unit && (
                <span
                  className="font-display text-xs font-bold uppercase tracking-[0.08em]"
                  style={{ color: SMARTMENU.amber }}
                >
                  {stat.unit}
                </span>
              )}
            </span>
            <span
              className="text-[11px] font-bold uppercase leading-tight tracking-[0.13em]"
              style={{ color: SMARTMENU.parchment }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DemoVideo() {
  return (
    <div
      className="relative mx-auto mt-10 w-full max-w-3xl overflow-hidden rounded-2xl shadow-xl"
      style={{ aspectRatio: '16/9', border: `1px solid ${SMARTMENU.ink}1A` }}
    >
      <iframe
        src="https://www.youtube.com/embed/q1GZEDwFLv8?rel=0"
        title="Smart Menu System demo"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}

function TestimonialVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
      return
    }
    void video.play()
    setIsPlaying(true)
  }

  return (
    <div className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl shadow-lg">
      <video
        ref={videoRef}
        /* 720p re-encode: 22.5 MB of source is not a thing to send over
           Philippine mobile data for a 440px-wide square. */
        src="/testimonial-720.mp4"
        className="block w-full"
        style={{ aspectRatio: '1/1', objectFit: 'cover' }}
        playsInline
        preload="metadata"
        poster="/testimonial-poster.jpg"
        onEnded={() => setIsPlaying(false)}
      />
      {/* The control stays mounted while playing, so the video can always be
          paused by pointer or keyboard. */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'I-pause ang testimonial video' : 'I-play ang testimonial video'}
        className="group absolute inset-0 flex items-center justify-center transition-colors"
        style={{ backgroundColor: isPlaying ? 'transparent' : 'rgba(20, 16, 13, 0.4)' }}
      >
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 group-hover:scale-105 ${
            isPlaying ? 'opacity-45 group-hover:opacity-100 group-focus-visible:opacity-100' : ''
          }`}
          style={{ backgroundColor: SMARTMENU.red }}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFF6F3" aria-hidden>
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFF6F3" aria-hidden>
              <path d="M7 4l14 8-14 8z" />
            </svg>
          )}
        </span>
      </button>
    </div>
  )
}

/**
 * Merchant reviews, pinned up the way they arrive — as screenshots. They are
 * wildly different shapes, so each gets the same white frame and sits inside
 * it rather than setting the row's height itself.
 */
function ReviewCard({
  src,
  alt,
  width,
  height,
  tilt,
}: {
  src: string
  alt: string
  width: number
  height: number
  tilt: string
}) {
  return (
    <div
      className="flex w-full max-w-[340px] items-center justify-center rounded-xl bg-white p-3 shadow-lg"
      style={{ height: 300, transform: tilt, border: `1px solid ${SMARTMENU.ink}12` }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="340px"
        className="h-full w-full object-contain"
      />
    </div>
  )
}

export function SocialProofSection() {
  return (
    <section
      id="proof"
      className="graph-paper scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
      style={{ backgroundColor: SMARTMENU.cream }}
    >
      <div className="rise mx-auto max-w-6xl">
        <div className="text-center">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: SMARTMENU.red }}>
            Panoorin ito
          </p>
          <h2 className="font-display t-display mx-auto max-w-[24ch] leading-tight" style={{ color: SMARTMENU.ink }}>
            Panoorin ang Smart Menu{' '}
            <span className="font-serif italic" style={{ color: SMARTMENU.red }}>
              habang nagbebenta
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-sm leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
            Ito ang eksaktong karanasan ng customer mo — mula sa pagbukas ng link hanggang sa checkout.
          </p>
        </div>
        <DemoVideo />

        <div className="mt-20 md:mt-28">
          <Eyebrow>Ano ang sinasabi ng mga merchant</Eyebrow>
          <h2 className="font-display t-display max-w-[24ch] leading-tight" style={{ color: SMARTMENU.ink }}>
            Mga totoong negosyante,{' '}
            <span className="font-serif italic" style={{ color: SMARTMENU.red }}>
              totoong resulta.
            </span>
          </h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-8 lg:flex-row lg:items-center lg:gap-12">
            <TestimonialVideo />
            <div className="flex flex-col items-center gap-8 md:flex-row md:gap-10">
              <ReviewCard
                src="/testimonial1.jpg"
                alt="Client testimonial praising the hero banner feature"
                width={1080}
                height={1120}
                tilt="rotate(-2deg)"
              />
              <ReviewCard
                src="/testimonial2.png"
                alt="Facebook review from Kenya Mendoza recommending WebNegosyo"
                width={1350}
                height={220}
                tilt="rotate(1.5deg)"
              />
            </div>
          </div>
          <p
            className="mx-auto mt-10 max-w-[62ch] text-center text-[11.5px] leading-relaxed"
            style={{ color: SMARTMENU.cocoa, opacity: 0.8 }}
          >
            Individual experiences presented here may not be typical. Their background, education,
            effort, and application affected their experience.
          </p>
        </div>

        <div
          className="mt-20 overflow-hidden rounded-3xl text-center shadow-lg md:mt-28"
          style={{ backgroundColor: '#FFFFFF', border: `1px solid ${SMARTMENU.ink}12` }}
        >
          <div className="px-6 pt-12">
            <Image
              src="/product.png"
              alt="Smart Menu product preview"
              width={720}
              height={520}
              className="mx-auto h-auto w-full max-w-[680px]"
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
          <div className="px-6 pb-12 pt-10">
            <BrandButton size="large" href={CHECKOUT_URL}>
              Sumali sa 100+ restaurants — {PRICE_LABEL}
            </BrandButton>
            <p className="mt-4 text-[13px]" style={{ color: SMARTMENU.cocoa }}>
              One-time investment. Lifetime returns.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
