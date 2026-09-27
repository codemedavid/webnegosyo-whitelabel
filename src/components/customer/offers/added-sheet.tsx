'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { formatPrice } from '@/lib/cart-utils'
import { needsChoices, offerableItems } from '@/lib/boost/offer-items'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { MenuItem } from '@/types/database'
import { AddedSheetContent } from './added-sheet-content'
import type { OfferTheme } from './offer-theme'

/** Keeps the upsell report continuous with the screen this replaces. */
const ANALYTICS_SOURCE = 'post_add'
const MAX_SUGGESTIONS = 4

interface AddedSheetProps {
  open: boolean
  addedItem: MenuItem
  suggestions: readonly MenuItem[]
  theme: OfferTheme
  tenantId: string
  hideCurrencySymbol?: boolean
  primaryLabel: string
  /** Put a suggestion in the cart. Only called for one-tap items. */
  onAdd: (item: MenuItem) => void
  /** Open a suggestion that needs a size or flavour chosen first. */
  onCustomize: (item: MenuItem) => void
  onPrimary: () => void
  onClose: () => void
}

/**
 * "Added — goes well with…" as a bottom sheet over the item page. Confirms the
 * add first, then offers up to four pairings with one tap each.
 */
export function AddedSheet({
  open,
  addedItem,
  suggestions,
  theme,
  tenantId,
  hideCurrencySymbol,
  primaryLabel,
  onAdd,
  onCustomize,
  onPrimary,
  onClose,
}: AddedSheetProps) {
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [isMounted, setMounted] = useState(false)
  const trackedRef = useRef(false)
  const shown = offerableItems(suggestions, { excludeIds: new Set([addedItem.id]), limit: MAX_SUGGESTIONS })

  useBodyScrollLock(open)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!open) {
      trackedRef.current = false
      setAddedIds(new Set())
      return
    }
    if (trackedRef.current || shown.length === 0) return
    trackedRef.current = true
    trackAnalyticsEventAction(tenantId, 'upsell_shown', {
      source: ANALYTICS_SOURCE, sourceItemId: addedItem.id, suggestionCount: shown.length,
    })
  }, [open, shown.length, tenantId, addedItem.id])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!isMounted || !open) return null

  const handleAdd = (id: string) => {
    const item = shown.find((candidate) => candidate.id === id)
    if (!item || addedIds.has(id)) return
    trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
      source: ANALYTICS_SOURCE, itemId: id, sourceItemId: addedItem.id,
    })
    if (needsChoices(item)) {
      onCustomize(item)
      return
    }
    onAdd(item)
    setAddedIds((current) => new Set(current).add(id))
  }

  const handleDismiss = () => {
    if (shown.length > 0 && addedIds.size === 0) {
      trackAnalyticsEventAction(tenantId, 'upsell_dismissed', { source: ANALYTICS_SOURCE, sourceItemId: addedItem.id })
    }
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Added to your order">
      <button
        type="button"
        aria-label="Close"
        onClick={handleDismiss}
        className="absolute inset-0 bg-black/45 animate-in fade-in duration-200"
      />
      <div
        className="relative mx-auto w-full max-w-lg rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out"
        style={{ backgroundColor: theme.surface, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full" style={{ backgroundColor: theme.border }} />
        <AddedSheetContent
          addedName={addedItem.name}
          suggestions={shown.map((item) => ({
            id: item.id,
            name: item.name,
            priceLabel: `+${formatPrice(item.discounted_price ?? item.price, { hideCurrencySymbol })}`,
            imageUrl: item.image_url,
          }))}
          addedIds={addedIds}
          theme={theme}
          primaryLabel={primaryLabel}
          secondaryLabel="Keep browsing"
          onAdd={handleAdd}
          onPrimary={onPrimary}
          onSecondary={handleDismiss}
        />
      </div>
    </div>,
    document.body
  )
}
