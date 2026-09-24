'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, ShoppingCart } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { describeCartCount } from '@/lib/senior-mode'
import type { BrandingColors } from '@/lib/branding-utils'
import { useSeniorMode } from './senior-mode-provider'

/** How long the "Added!" cue stays on the bar after the count goes up. */
const JUST_ADDED_MS = 2500
/** Ignore count changes this soon after mount — that is the cart restoring. */
const CUE_ARM_DELAY_MS = 1000

/** Room under the page for the fixed bar; only exists while the bar does. */
const BODY_CLEARANCE_CSS = 'body{padding-bottom:8rem}'

interface SeniorCartBarProps {
  tenantSlug: string
  branding: BrandingColors
  hideCurrencySymbol?: boolean
}

/**
 * Always-visible cart bar pinned to the bottom of the menu (senior mode only).
 *
 * Replaces "find the tiny cart icon in the header" with one large button that
 * says what is in the cart and goes straight to the cart page, where the step
 * tracker takes over. An empty cart still shows the bar, with a hint, so the
 * customer learns where the cart lives before they need it.
 */
export function SeniorCartBar({ tenantSlug, branding, hideCurrencySymbol }: SeniorCartBarProps) {
  const isSeniorMode = useSeniorMode()
  const router = useRouter()
  const { item_count: itemCount, total } = useCart()
  const isJustAdded = useJustAdded(itemCount)

  if (!isSeniorMode) return null

  const hasItems = itemCount > 0

  return (
    <>
      {/* Keeps the last dishes AND the site footer (rendered by the layout,
          after this page) scrollable above the fixed bar. */}
      <style>{BODY_CLEARANCE_CSS}</style>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 px-4 pt-3"
        style={{
          backgroundColor: branding.background,
          borderColor: branding.border,
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto max-w-2xl">
          {hasItems ? (
            <button
              type="button"
              onClick={() => router.push(`/${tenantSlug}/cart`)}
              aria-label={`View cart, ${describeCartCount(itemCount)}`}
              className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl px-5 py-3 text-left shadow-lg transition-transform active:scale-[0.98]"
              style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
            >
              <span className="relative flex-shrink-0">
                <ShoppingCart className="h-8 w-8" aria-hidden="true" />
                <span
                  className="absolute -right-2.5 -top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold"
                  style={{ backgroundColor: branding.buttonPrimaryText, color: branding.buttonPrimary }}
                >
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold leading-tight">
                  {isJustAdded ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-5 w-5" aria-hidden="true" /> Added! View cart
                    </span>
                  ) : 'View cart'}
                </span>
                <span className="block text-base font-medium opacity-90">
                  {describeCartCount(itemCount)} · {formatPrice(total, { hideCurrencySymbol })}
                </span>
              </span>
              <ChevronRight className="h-8 w-8 flex-shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <div
              className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-3"
              style={{ borderColor: branding.border, color: branding.textSecondary }}
            >
              <ShoppingCart className="h-8 w-8 flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-lg font-bold" style={{ color: branding.textPrimary }}>
                  {describeCartCount(0)}
                </span>
                <span className="block text-base">Tap any food to add it.</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * True for a moment after `count` goes up — the bar's "it worked" cue.
 *
 * The cart restores from localStorage in CartProvider's mount effect, which
 * runs AFTER this component's, so a hard page load reads as 0 → N. The cue
 * is armed only once the page has settled, so a returning customer is not
 * told "Added!" for dishes they added yesterday.
 */
function useJustAdded(count: number): boolean {
  const previousCount = useRef(count)
  const isArmed = useRef(false)
  const [isJustAdded, setIsJustAdded] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { isArmed.current = true }, CUE_ARM_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const hasIncreased = count > previousCount.current
    previousCount.current = count
    // Any count change cancels the previous fade timer (effect cleanup), so a
    // drop inside the cue window must clear the cue itself or it sticks.
    if (!hasIncreased || !isArmed.current) {
      setIsJustAdded(false)
      return
    }
    setIsJustAdded(true)
    const timer = setTimeout(() => setIsJustAdded(false), JUST_ADDED_MS)
    return () => clearTimeout(timer)
  }, [count])

  return isJustAdded
}
