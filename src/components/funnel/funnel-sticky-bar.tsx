'use client'

import { useEffect, useState } from 'react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { CTA, PLAN } from './funnel-copy'
import { FUNNEL_ORDER_ANCHOR, FUNNEL_PRICE, OFFER_NAME, formatPeso } from './funnel-offer'
import { CtaLink, FUNNEL_LINE } from './funnel-ui'

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
      className={`fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 backdrop-blur transition-transform duration-300 motion-reduce:transition-none ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ borderColor: FUNNEL_LINE, boxShadow: '0 -10px 30px -18px rgba(28,22,19,0.35)' }}
    >
      <div
        className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="hidden min-w-0 sm:block">
          <p className="truncate font-extrabold" style={{ color: SMARTMENU.ink }}>{OFFER_NAME}</p>
          <p className="truncate text-[12.5px]" style={{ color: SMARTMENU.cocoa }}>{CTA.reassurance}</p>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:flex-none sm:justify-end">
          <div className="text-left leading-tight sm:text-right">
            <p className="text-[11.5px] line-through" style={{ color: SMARTMENU.cocoa }}>{PLAN.anchorNote}</p>
            <p className="font-extrabold tabular-nums" style={{ color: SMARTMENU.red }}>
              <span className="text-xl">{formatPeso(FUNNEL_PRICE)}</span>
              <span className="text-[13px]">{PLAN.priceUnit}</span>
            </p>
          </div>
          <CtaLink>{CTA.short} →</CtaLink>
        </div>
      </div>
    </div>
  )
}
