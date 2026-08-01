'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { CourtButton, Lit, SectionTitle } from './court'
import { SegmentDisplay } from './segment-display'
import { COURT, PRICE_LABEL, STATS, TARP } from './landing-theme'

/**
 * The board itself — the four standing figures, in seven-segment, in the steel
 * housing. Every other number on the page reads back to this.
 */
export function StatsBand() {
  return (
    <div className="relative z-10 px-5 py-16 md:px-8 md:py-20">
      <div
        className="mx-auto grid max-w-6xl grid-cols-2 gap-px md:grid-cols-4"
        style={{
          backgroundColor: 'rgba(237,232,218,0.1)',
          border: '1px solid rgba(237,232,218,0.12)',
          boxShadow: '0 26px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(237,232,218,0.1)',
        }}
      >
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-3 px-4 py-8 text-center md:py-10"
            style={{ backgroundColor: '#070A08' }}
          >
            <span className="flex items-end gap-1.5">
              <SegmentDisplay
                value={stat.value}
                color={COURT.ledAmber}
                height="clamp(2.1rem, 6vw, 2.75rem)"
                label={stat.value}
              />
              {'unit' in stat && stat.unit && (
                <span
                  className="pb-1 font-display text-xs uppercase leading-none tracking-[0.08em]"
                  style={{ color: COURT.ledAmber }}
                >
                  {stat.unit}
                </span>
              )}
            </span>
            <span
              className="text-[11px] font-bold uppercase leading-tight tracking-[0.13em]"
              style={{ color: COURT.laneDim }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoVideo() {
  return (
    <div
      className="relative mx-auto mt-12 w-full max-w-3xl overflow-hidden"
      style={{
        aspectRatio: '16/9',
        border: '1px solid rgba(237,232,218,0.14)',
        boxShadow: '0 34px 80px rgba(0,0,0,0.6)',
      }}
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
    <div className="relative mx-auto w-full max-w-[440px]">
      <video
        ref={videoRef}
        /* 720p re-encode: 22.5 MB of source is not a thing to send over
           Philippine mobile data for a 440px-wide square. */
        src="/testimonial-720.mp4"
        className="block w-full"
        style={{
          aspectRatio: '1/1',
          objectFit: 'cover',
          border: '1px solid rgba(237,232,218,0.14)',
        }}
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
        style={{ backgroundColor: isPlaying ? 'transparent' : 'rgba(7,10,8,0.45)' }}
      >
        <span
          className={`flex h-16 w-16 items-center justify-center transition-all duration-200 group-hover:scale-105 ${
            isPlaying ? 'opacity-45 group-hover:opacity-100 group-focus-visible:opacity-100' : ''
          }`}
          style={{
            backgroundColor: COURT.plateRed,
            clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
          }}
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
 * wildly different shapes, so each gets the same notice frame and sits inside
 * it rather than setting the row's height itself.
 */
function ReviewNotice({
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
      className="flex w-full max-w-[340px] items-center justify-center p-3"
      style={{
        height: 300,
        backgroundColor: TARP.vinyl,
        transform: tilt,
        boxShadow: '0 20px 46px rgba(0,0,0,0.5)',
      }}
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

function TestimonialCards() {
  return (
    <div className="mx-auto mt-10 flex flex-col items-center justify-center gap-8 md:flex-row md:items-center md:gap-12">
      <ReviewNotice
        src="/testimonial1.jpg"
        alt="Client testimonial praising the hero banner feature"
        width={1080}
        height={1120}
        tilt="rotate(-2deg)"
      />
      <ReviewNotice
        src="/testimonial2.png"
        alt="Facebook review from Kenya Mendoza recommending WebNegosyo"
        width={1350}
        height={220}
        tilt="rotate(1.5deg)"
      />
    </div>
  )
}

export function SocialProofSection() {
  return (
    <section id="proof" className="relative z-10 scroll-mt-16 px-5 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionTitle body="Ito ang eksaktong karanasan ng customer mo — mula sa pagbukas ng link hanggang sa checkout.">
          Panoorin ang Smart Menu <Lit>habang nagbebenta</Lit>
        </SectionTitle>
        <DemoVideo />

        <div className="mt-24 md:mt-32">
          <SectionTitle body="Mga totoong negosyanteng gumagamit na ng Smart Menu ngayon.">
            Ano ang sinasabi ng mga merchant
          </SectionTitle>
          <div className="mt-12">
            <TestimonialVideo />
            <TestimonialCards />
          </div>
          <p
            className="mx-auto mt-10 max-w-[62ch] text-center text-[11.5px] leading-relaxed"
            style={{ color: COURT.laneDim }}
          >
            Individual experiences presented here may not be typical. Their background, education,
            effort, and application affected their experience.
          </p>
        </div>

        <div
          className="mt-24 overflow-hidden text-center md:mt-32"
          style={{
            backgroundColor: COURT.groundLit,
            border: '1px solid rgba(237,232,218,0.12)',
          }}
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
            <CourtButton size="large">Sumali sa 100+ restaurants — {PRICE_LABEL}</CourtButton>
            <p className="mt-4 text-[13px]" style={{ color: COURT.laneDim }}>
              One-time investment. Lifetime returns.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
