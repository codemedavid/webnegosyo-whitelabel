'use client'

import { useEffect, useState } from 'react'
import { STICKY } from './funnel-copy'
import { FUNNEL_ORDER_ANCHOR } from './funnel-offer'
import { CtaLink } from './funnel-ui'

const HERO_CTA_ID = 'hero-cta'
/** The bar hides once the order form's top is within this share of the viewport. */
const ORDER_REVEAL_RATIO = 0.8

/**
 * Whether the bar should show: the hero's button has scrolled above the
 * viewport and the order form is not yet on screen. Read from layout on every
 * scroll frame rather than from IntersectionObserver crossings — a jump to the
 * top (logo tap, iOS status-bar tap) skips the crossing and left the bar stuck
 * over the headline.
 */
function shouldShowBar(): boolean {
  const heroCta = document.getElementById(HERO_CTA_ID)
  const order = document.getElementById(FUNNEL_ORDER_ANCHOR)
  if (!heroCta || !order) return false
  const isHeroCtaAbove = heroCta.getBoundingClientRect().bottom < 0
  const orderRect = order.getBoundingClientRect()
  const isOrderOnScreen = orderRect.top < window.innerHeight * ORDER_REVEAL_RATIO && orderRect.bottom > 0
  return isHeroCtaAbove && !isOrderOnScreen
}

/**
 * The reference's bottom buy bar. It appears once the hero's button has
 * scrolled away and hides while the order form itself is on screen, so it
 * never covers the form it points to.
 */
export function FunnelStickyBar() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setIsVisible(shouldShowBar()))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div
      aria-hidden={!isVisible}
      inert={!isVisible}
      className={`fn-nav fixed inset-x-0 bottom-0 z-50 !border-b-0 border-t border-white/[0.06] transition-transform duration-300 motion-reduce:transition-none ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div
        className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="min-w-0 leading-tight">
          <p className="fn-tabular truncate text-[15px] font-semibold text-white">
            {STICKY.title} · {STICKY.price}
          </p>
          <p className="fn-serif truncate text-[14px] text-[#F5A623]">{STICKY.note}</p>
        </div>
        <CtaLink className="shrink-0">{STICKY.cta}</CtaLink>
      </div>
    </div>
  )
}
