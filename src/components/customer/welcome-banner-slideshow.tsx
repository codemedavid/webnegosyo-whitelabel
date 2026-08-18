'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WelcomeBanner } from '@/lib/outlets/welcome-page'

interface WelcomeBannerSlideshowProps {
  /** Already normalized — callers run normalizeWelcomeBanners first. */
  banners: readonly WelcomeBanner[]
}

const ASPECT_BY_FORMAT: Record<WelcomeBanner['format'], string> = {
  landscape: 'aspect-video',
  portrait: 'aspect-[3/4]',
  square: 'aspect-square',
}

const AUTOPLAY_MS = 5000

/**
 * `scrollTo` with options is missing in jsdom and in older mobile browsers;
 * setting `scrollLeft` still lands on the right slide, just without the glide.
 */
function scrollToSlide(track: HTMLDivElement | null, slide: number) {
  if (!track) return
  const left = track.clientWidth * slide
  if (typeof track.scrollTo === 'function') {
    track.scrollTo({ left, behavior: 'smooth' })
    return
  }
  track.scrollLeft = left
}

/**
 * Promo banners on the multi-branch welcome page — one full-width slideshow.
 *
 * Every banner is a full-bleed slide the customer swipes (native scroll-snap,
 * so there is no gesture library and the scrollbar keeps working) with dots to
 * jump, and it advances on its own so a second promo is seen without any
 * interaction. Autoplay stops for good on the first manual move: taking over
 * and then being yanked to the next slide is the worst version of this control.
 *
 * The deck takes one shape — the first banner's format — because slides of
 * different heights make the page jump on every advance. Merchants pick the
 * format per banner; the first one leads.
 */
export function WelcomeBannerSlideshow({ banners }: WelcomeBannerSlideshowProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const goTo = useCallback((next: number, isManual: boolean) => {
    if (isManual) setIsPaused(true)
    setIndex(next)
    scrollToSlide(trackRef.current, next)
  }, [])

  useEffect(() => {
    if (isPaused || banners.length < 2) return
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % banners.length
        scrollToSlide(trackRef.current, next)
        return next
      })
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [isPaused, banners.length])

  // Swiping is the other way the slide changes; keep the dots honest about it.
  const handleScroll = useCallback(() => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const scrolled = Math.round(track.scrollLeft / track.clientWidth)
    setIndex((current) => (current === scrolled ? current : scrolled))
  }, [])

  if (banners.length === 0) return null

  const aspect = ASPECT_BY_FORMAT[banners[0].format]

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        data-testid="welcome-banner-slides"
        className={`flex w-full snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${aspect}`}
      >
        {banners.map((banner) => (
          <figure key={banner.id} className="relative h-full w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={banner.imageUrl}
              alt={banner.title ?? ''}
              className="h-full w-full object-cover"
            />
            {(banner.title || banner.description) && (
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-white">
                {banner.title && <span className="block text-sm font-bold">{banner.title}</span>}
                {banner.description && (
                  <span className="block text-xs opacity-90">{banner.description}</span>
                )}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {banners.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {banners.map((banner, dot) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Slide ${dot + 1}`}
              aria-current={dot === index ? 'true' : undefined}
              onClick={() => goTo(dot, true)}
              className={`h-1.5 rounded-full transition-all ${
                dot === index ? 'w-5 bg-foreground/80' : 'w-1.5 bg-foreground/25'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
