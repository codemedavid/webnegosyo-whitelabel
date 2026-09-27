'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/cart-utils'
import { needsChoices, offerableItems } from '@/lib/boost/offer-items'
import type { MenuItem } from '@/types/database'
import { CartOfferRow } from './cart-offer-row'
import type { OfferTheme } from './offer-theme'

/** Keeps the upsell report continuous with the interstitial this replaces. */
const ANALYTICS_SOURCE = 'checkout_modal'

interface CartOffersSectionProps {
  /** Suggestions prefetched for this cart; null while loading. */
  suggestions: readonly MenuItem[] | null
  cartItemIds: readonly string[]
  maxItems: number
  title: string
  subtitle?: string
  theme: OfferTheme
  tenantId: string
  tenantSlug: string
  hideCurrencySymbol?: boolean
  /** e.g. close the cart drawer before opening a dish that needs choices. */
  onBeforeNavigate?: () => void
}

/**
 * The cart's last call, inline. Added items join the cart immediately and
 * drop out of the row on the next refresh of suggestions; anything that needs
 * a size or flavour opens its page instead of going in half-configured.
 */
export function CartOffersSection({
  suggestions,
  cartItemIds,
  maxItems,
  title,
  subtitle,
  theme,
  tenantId,
  tenantSlug,
  hideCurrencySymbol,
  onBeforeNavigate,
}: CartOffersSectionProps) {
  const router = useRouter()
  const { addItem } = useCart()
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [lastSuggestions, setLastSuggestions] = useState<readonly MenuItem[]>([])
  const trackedRef = useRef(false)

  // Adding an item changes the cart, which clears the prefetched list until
  // the next one lands. Hold the last list so the row does not vanish and jump.
  useEffect(() => {
    if (suggestions) setLastSuggestions(suggestions)
  }, [suggestions])
  const pool = suggestions ?? lastSuggestions

  const shown = useMemo(
    () => offerableItems(pool, { excludeIds: new Set(cartItemIds), limit: maxItems }),
    [pool, cartItemIds, maxItems]
  )
  // An added item stays in place, marked Added, rather than disappearing mid-tap.
  const visible = useMemo(() => {
    const keep = new Set([...shown.map((item) => item.id), ...addedIds])
    return offerableItems(pool.filter((item) => keep.has(item.id)), { limit: maxItems + addedIds.size })
  }, [shown, pool, addedIds, maxItems])

  useEffect(() => {
    if (trackedRef.current || shown.length === 0) return
    trackedRef.current = true
    trackAnalyticsEventAction(tenantId, 'upsell_shown', { source: ANALYTICS_SOURCE, suggestionCount: shown.length })
  }, [shown.length, tenantId])

  if (visible.length === 0) return null

  const handleAdd = (id: string) => {
    const item = visible.find((candidate) => candidate.id === id)
    if (!item || addedIds.has(id)) return
    trackAnalyticsEventAction(tenantId, 'upsell_clicked', { source: ANALYTICS_SOURCE, itemId: id })
    if (needsChoices(item)) {
      onBeforeNavigate?.()
      router.push(`/${tenantSlug}/menu/item/${item.id}`)
      return
    }
    addItem(item, undefined, [], 1, undefined, ANALYTICS_SOURCE)
    setAddedIds((current) => new Set(current).add(id))
  }

  return (
    <CartOfferRow
      title={title}
      subtitle={subtitle}
      items={visible.map((item) => ({
        id: item.id,
        name: item.name,
        priceLabel: formatPrice(item.discounted_price ?? item.price, { hideCurrencySymbol }),
        imageUrl: item.image_url,
      }))}
      addedIds={addedIds}
      theme={theme}
      onAdd={handleAdd}
    />
  )
}
