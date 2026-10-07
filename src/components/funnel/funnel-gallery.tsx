'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LANDING_PHOTOS, SMARTMENU } from '@/components/landing/landing-theme'
import { GALLERY } from './funnel-copy'
import { FUNNEL_LINE } from './funnel-ui'

interface Slide {
  src: string
  alt: string
  /** Screenshots and product shots must show whole; photos may crop. */
  fit: 'contain' | 'cover'
}

const SLIDES: readonly Slide[] = [
  { src: '/product.png', alt: 'SmartMenu ordering website and merchant app preview', fit: 'contain' },
  { ...LANDING_PHOTOS.burger, fit: 'cover' },
  { ...LANDING_PHOTOS.counter, fit: 'cover' },
  { src: '/testimonial1.jpg', alt: 'A merchant’s message praising their SmartMenu', fit: 'contain' },
  { ...LANDING_PHOTOS.cafe, fit: 'cover' },
]

const LAST_INDEX = SLIDES.length - 1
/** How long a tap-triggered smooth scroll may run before swipes take over again. */
const PROGRAMMATIC_SCROLL_MS = 700

function clampIndex(index: number): number {
  return Math.min(Math.max(index, 0), LAST_INDEX)
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The reference's product gallery as a real carousel: a scroll-snap track the
 * visitor can swipe, every slide mounted up front (switching never waits on a
 * download), and thumbnails, arrows and arrow keys that drive the same track.
 * The active slide is read back from the track's scroll position, so a swipe
 * and a tap can never disagree.
 */
export function FunnelGallery() {
  const trackRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  /** The slide a tap is scrolling to; scroll events on the way there don't move the highlight. */
  const pendingTargetRef = useRef<number | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [activeIndex, setActiveIndex] = useState(0)

  const goTo = useCallback((index: number) => {
    const track = trackRef.current
    if (!track) return
    const target = clampIndex(index)
    setActiveIndex(target)
    pendingTargetRef.current = target
    clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = setTimeout(() => {
      pendingTargetRef.current = null
    }, PROGRAMMATIC_SCROLL_MS)
    track.scrollTo({ left: target * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [])

  const syncFromScroll = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const track = trackRef.current
      if (!track || track.clientWidth === 0) return
      const visibleIndex = clampIndex(Math.round(track.scrollLeft / track.clientWidth))
      const pendingTarget = pendingTargetRef.current
      if (pendingTarget !== null && visibleIndex !== pendingTarget) return
      pendingTargetRef.current = null
      setActiveIndex(visibleIndex)
    })
  }, [])

  // Keep the visible slide in place when the frame changes width (rotation, resize).
  useEffect(() => {
    const realign = () => {
      const track = trackRef.current
      if (track) track.scrollTo({ left: activeIndex * track.clientWidth, behavior: 'auto' })
    }
    window.addEventListener('resize', realign)
    return () => window.removeEventListener('resize', realign)
  }, [activeIndex])

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      clearTimeout(pendingTimerRef.current)
    },
    []
  )

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(activeIndex + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(activeIndex - 1)
    }
  }

  return (
    <div role="region" aria-roledescription="carousel" aria-label={GALLERY.label}>
      <div className="relative">
        <div
          ref={trackRef}
          data-testid="funnel-gallery-track"
          tabIndex={0}
          onScroll={syncFromScroll}
          onKeyDown={handleKeyDown}
          className="funnel-no-scrollbar flex aspect-[16/11] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 sm:aspect-[4/3]"
          style={{ backgroundColor: SMARTMENU.cream, border: `1px solid ${FUNNEL_LINE}`, outlineColor: SMARTMENU.amber }}
        >
          {SLIDES.map((slide, index) => (
            <div
              key={slide.src}
              data-slide
              role="group"
              aria-roledescription="slide"
              aria-label={GALLERY.slide(index + 1, SLIDES.length)}
              aria-hidden={index !== activeIndex}
              className="relative h-full w-full shrink-0 snap-center snap-always"
            >
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                priority={index === 0}
                loading={index === 0 ? undefined : 'eager'}
                sizes="(min-width: 1024px) 560px, 100vw"
                draggable={false}
                className={slide.fit === 'contain' ? 'object-contain p-2 sm:p-4' : 'object-cover'}
              />
            </div>
          ))}
        </div>

        <ArrowButton direction="previous" isDisabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)} />
        <ArrowButton direction="next" isDisabled={activeIndex === LAST_INDEX} onClick={() => goTo(activeIndex + 1)} />

        <span
          aria-live="polite"
          className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums"
          style={{ backgroundColor: 'rgba(28,22,19,0.72)', color: '#FFF7EE' }}
        >
          {activeIndex + 1} / {SLIDES.length}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-3">
        {SLIDES.map((slide, index) => {
          const isActive = index === activeIndex
          return (
            <button
              key={slide.src}
              type="button"
              onClick={() => goTo(index)}
              aria-label={GALLERY.thumbnail(index + 1, slide.alt)}
              aria-pressed={isActive}
              className="relative aspect-square overflow-hidden rounded-xl transition-opacity hover:opacity-90"
              style={{
                backgroundColor: SMARTMENU.cream,
                border: `2px solid ${isActive ? SMARTMENU.red : FUNNEL_LINE}`,
                opacity: isActive ? 1 : 0.75,
              }}
            >
              <Image
                src={slide.src}
                alt=""
                fill
                sizes="(min-width: 1024px) 110px, 20vw"
                className={slide.fit === 'contain' ? 'object-contain p-1' : 'object-cover'}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ArrowButton({
  direction,
  isDisabled,
  onClick,
}: {
  direction: 'previous' | 'next'
  isDisabled: boolean
  onClick: () => void
}) {
  const isNext = direction === 'next'
  const Icon = isNext ? ChevronRight : ChevronLeft
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={isNext ? GALLERY.next : GALLERY.previous}
      className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition-opacity disabled:pointer-events-none disabled:opacity-0 ${
        isNext ? 'right-2' : 'left-2'
      }`}
      style={{ color: SMARTMENU.ink, border: `1px solid ${FUNNEL_LINE}` }}
    >
      <Icon aria-hidden className="h-5 w-5" />
    </button>
  )
}
