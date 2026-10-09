'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type WheelEvent } from 'react'

import { SLIDE_INTERVAL } from '@/lib/hero-builder/constants'
import { resolveEntryCtaLabel, resolveEntryLayout, resolveEntryOption } from '@/lib/hero-builder/entry-copy'
import { ENTRY_MODES } from '@/lib/hero-builder/link-target'
import { clampNumber, safeHref, safeMediaUrl } from '@/lib/hero-builder/safe-values'
import type { EntryMode, OrderEntryContent, Slide, SlideshowContent, StoreLogoContent } from '@/lib/hero-builder/types'

import { HeroIcon } from '../icons'
import { useHeroLinkClick } from './link-context'
import { useWelcomeRuntime } from './welcome-runtime'

function EntryOptionBody({ content, mode, layout }: { content: OrderEntryContent; mode: EntryMode; layout: 'tiles' | 'list' }) {
  const option = resolveEntryOption(content, mode)
  return (
    <>
      {content.showIcons !== false && (
        <span className="hb-entry-ic">
          <HeroIcon name={option.icon} />
        </span>
      )}
      <span className="hb-entry-txt">
        <span className="hb-entry-label">{option.label}</span>
        {content.showBlurbs !== false && <span className="hb-entry-blurb">{option.blurb}</span>}
      </span>
      {layout === 'list' && <HeroIcon name="ChevronRight" className="hb-entry-go" />}
    </>
  )
}

/**
 * Same size as the real choices, nothing to tap: showing the start button
 * and then swapping it for tiles would move the target under a thumb.
 */
function EntryPlaceholder({ content, layout }: { content: OrderEntryContent; layout: 'tiles' | 'list' }) {
  return (
    <div className={`hb-entry hb-entry--${layout}`} aria-busy="true" aria-label="Loading order options">
      {ENTRY_MODES.map((mode) => (
        <div key={mode} className="hb-entry-opt hb-entry-skel" aria-hidden="true">
          <EntryOptionBody content={content} mode={mode} layout={layout} />
        </div>
      ))}
    </div>
  )
}

/** The welcome page's way in: one tile per order type, or one start button. */
export function OrderEntryBlock({ content }: { content: OrderEntryContent }) {
  const runtime = useWelcomeRuntime()
  if (runtime.isLoadingModes && content.layout !== 'cta') return <EntryPlaceholder content={content} layout={content.layout} />
  const layout = resolveEntryLayout(content, runtime.modes.length)

  if (layout === 'cta') {
    return (
      <div className="hb-entry hb-entry--cta">
        <button type="button" className="hb-entry-cta" onClick={runtime.onStart}>
          <span>{resolveEntryCtaLabel(content)}</span>
          {content.ctaIcon && <HeroIcon name={content.ctaIcon} />}
        </button>
      </div>
    )
  }

  return (
    <div className={`hb-entry hb-entry--${layout}`} role="group" aria-label="How would you like your order?">
      {runtime.modes.map((mode) => (
        <button key={mode} type="button" className="hb-entry-opt" onClick={() => runtime.onChooseMode(mode)}>
          <EntryOptionBody content={content} mode={mode} layout={layout} />
        </button>
      ))}
    </div>
  )
}

/** The store's logo from its branding; the name stands in when there is none. */
export function StoreLogoBlock({ content, isEditor }: { content: StoreLogoContent; isEditor: boolean }) {
  const { logoUrl, storeName } = useWelcomeRuntime()
  const src = safeMediaUrl(logoUrl)
  if (src) {
    return (
      <div className="hb-logo">
        {/* eslint-disable-next-line @next/next/no-img-element -- merchant logo from any host */}
        <img src={src} alt={storeName} decoding="async" />
      </div>
    )
  }
  if (content.fallback === 'none') {
    return isEditor ? <div className="hb-placeholder">Upload a logo in Branding Studio</div> : null
  }
  return (
    <div className="hb-logo">
      <p className="hb-logo-name">{storeName}</p>
    </div>
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const SCROLL_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener?.('change', onChange)
  return () => query.removeEventListener?.('change', onChange)
}

/** The visitor asked their device for less motion: no autoplay, no glide. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}

/**
 * `scrollTo` with options is missing in jsdom and some older mobile browsers;
 * setting `scrollLeft` still lands on the right slide, just without the glide.
 */
function scrollToSlide(track: HTMLDivElement | null, slide: number, isInstant: boolean) {
  if (!track) return
  const left = track.clientWidth * slide
  if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: isInstant ? 'auto' : 'smooth' })
  else track.scrollLeft = left
}

function usableSlides(slides: unknown): Slide[] {
  if (!Array.isArray(slides)) return []
  return slides
    .map((slide: Slide) => ({ ...slide, src: safeMediaUrl(slide?.src) ?? '' }))
    .filter((slide) => !!slide.src)
}

function SlideMedia({ slide, isFirst }: { slide: Slide; isFirst: boolean }) {
  const onLinkClick = useHeroLinkClick()
  const href = safeHref(slide.href)
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- merchant URLs from any host
    <img src={slide.src} alt={slide.alt || slide.title || ''} loading={isFirst ? 'eager' : 'lazy'} decoding="async" />
  )
  if (!href) return img
  const isExternal = /^https?:/i.test(href)
  return (
    <a href={href} onClick={onLinkClick} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {img}
    </a>
  )
}

/**
 * Swipeable promo slides (native scroll-snap, no gesture library) that advance
 * on their own. Autoplay stops for good on the first manual move — being
 * yanked to the next slide after taking over is the worst version of this.
 */
export function SlideshowBlock({ content, isEditor }: { content: SlideshowContent; isEditor: boolean }) {
  const slides = usableSlides(content.slides)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const seconds = clampNumber(content.interval, SLIDE_INTERVAL.min, SLIDE_INTERVAL.max) ?? SLIDE_INTERVAL.fallback
  const shouldAutoplay = content.autoplay !== false && !isPaused && !prefersReducedMotion && slides.length > 1

  useEffect(() => {
    if (!shouldAutoplay) return
    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length
        scrollToSlide(trackRef.current, next, false)
        return next
      })
    }, seconds * 1000)
    return () => window.clearInterval(timer)
  }, [shouldAutoplay, seconds, slides.length])

  const goTo = useCallback(
    (next: number) => {
      setIsPaused(true)
      setIndex(next)
      scrollToSlide(trackRef.current, next, prefersReducedMotion)
    },
    [prefersReducedMotion],
  )

  // Any manual move takes over for good — a touch, a sideways trackpad swipe
  // or the arrow keys (none of which fire pointerdown).
  const pause = useCallback(() => setIsPaused(true), [])
  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) setIsPaused(true)
  }, [])
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (SCROLL_KEYS.has(event.key)) setIsPaused(true)
  }, [])

  const handleScroll = useCallback(() => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const scrolled = Math.round(track.scrollLeft / track.clientWidth)
    setIndex((current) => (current === scrolled ? current : scrolled))
  }, [])

  if (!slides.length) return isEditor ? <div className="hb-placeholder">Add slides</div> : null

  return (
    <div className="hb-slides" aria-roledescription="carousel">
      <div ref={trackRef} className="hb-slides-track" onScroll={handleScroll} onPointerDown={pause} onWheel={handleWheel} onKeyDown={handleKeyDown}>
        {slides.map((slide, i) => (
          <figure key={slide.id} className="hb-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
            <SlideMedia slide={slide} isFirst={i === 0} />
            {(slide.title || slide.caption) && (
              <figcaption>
                {slide.title && <span className="hb-slide-title">{slide.title}</span>}
                {slide.caption && <span className="hb-slide-caption">{slide.caption}</span>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {content.showDots !== false && slides.length > 1 && (
        <div className="hb-dots">
          {slides.map((slide, dot) => (
            <button
              key={slide.id}
              type="button"
              className="hb-dot"
              aria-label={`Slide ${dot + 1}`}
              aria-current={dot === index ? 'true' : undefined}
              onClick={() => goTo(dot)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
