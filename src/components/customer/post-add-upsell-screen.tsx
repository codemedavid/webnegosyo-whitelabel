'use client'

import { memo, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Package, Sparkles } from 'lucide-react'
import { UpsellFullScreenLayout } from '@/components/customer/upsell-full-screen-layout'
import { UpsellItemCard } from '@/components/customer/upsell-item-card'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { useImagePreload } from '@/hooks/useImagePreload'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem, BundleWithSlots } from '@/types/database'

export type UpsellMode = 'pairs_only' | 'bundle_only' | 'pairs_and_bundle'

export function getUpsellMode(
  suggestions: MenuItem[],
  matchingBundle: BundleWithSlots | null
): UpsellMode | null {
  const hasSuggestions = suggestions.length > 0
  const hasBundle = matchingBundle !== null

  if (hasSuggestions && hasBundle) return 'pairs_and_bundle'
  if (hasSuggestions) return 'pairs_only'
  if (hasBundle) return 'bundle_only'
  return null
}

interface PostAddUpsellScreenProps {
  open: boolean
  onClose: () => void
  onAddItem: (item: MenuItem) => void
  onAcceptBundle: (bundle: BundleWithSlots) => void
  suggestions: MenuItem[]
  matchingBundle: BundleWithSlots | null
  triggerItemName: string
  tenantId: string
  sourceItemId: string
  hideCurrencySymbol?: boolean
}

const gridVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
}

export const PostAddUpsellScreen = memo(function PostAddUpsellScreen({
  open,
  onClose,
  onAddItem,
  onAcceptBundle,
  suggestions,
  matchingBundle,
  triggerItemName,
  tenantId,
  sourceItemId,
  hideCurrencySymbol,
}: PostAddUpsellScreenProps) {
  const shownTrackedRef = useRef(false)
  const addedCountRef = useRef(0)

  const mode = getUpsellMode(suggestions, matchingBundle)
  const imageUrls = useMemo(
    () => suggestions.map((s) => s.image_url).filter(Boolean) as string[],
    [suggestions]
  )
  useImagePreload(imageUrls)

  // Track upsell_shown once per open, reset on close
  useEffect(() => {
    if (open && !shownTrackedRef.current && mode) {
      shownTrackedRef.current = true
      trackAnalyticsEventAction(tenantId, 'upsell_shown', {
        source: 'post_add',
        mode,
        itemCount: suggestions.length,
        sourceItemId,
        bundleId: matchingBundle?.id ?? null,
      })
    }
    if (!open && shownTrackedRef.current) {
      shownTrackedRef.current = false
      addedCountRef.current = 0
    }
  }, [open, mode, tenantId, suggestions.length, sourceItemId, matchingBundle?.id])

  const handleAddItem = useCallback(
    (item: MenuItem) => {
      addedCountRef.current += 1
      onAddItem(item)
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: 'post_add',
        mode,
        itemId: item.id,
        itemName: item.name,
        price: item.discounted_price ?? item.price,
        sourceItemId,
      })
    },
    [onAddItem, tenantId, mode, sourceItemId]
  )

  const handleClose = useCallback(() => {
    trackAnalyticsEventAction(tenantId, 'upsell_dismissed', {
      source: 'post_add',
      mode,
      suggestionsShown: suggestions.length,
      itemsAdded: addedCountRef.current,
      sourceItemId,
    })
    onClose()
  }, [onClose, tenantId, mode, suggestions.length, sourceItemId])

  const handleAcceptBundle = useCallback(() => {
    if (!matchingBundle) return
    trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
      source: 'post_add',
      mode,
      bundleId: matchingBundle.id,
      bundleName: matchingBundle.name,
      sourceItemId,
    })
    onAcceptBundle(matchingBundle)
  }, [matchingBundle, onAcceptBundle, tenantId, mode, sourceItemId])

  if (!mode) return null

  const title =
    mode === 'bundle_only'
      ? 'Bundle Deal Available!'
      : `Perfect with ${triggerItemName}`
  const subtitle =
    mode === 'bundle_only'
      ? 'Save more with a combo'
      : 'Complete your meal'

  return (
    <UpsellFullScreenLayout
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      footer={
        mode === 'bundle_only' ? (
          <button
            onClick={handleClose}
            className="w-full py-3 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
            type="button"
          >
            No thanks, continue
          </button>
        ) : (
          <button
            onClick={handleClose}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            type="button"
          >
            Continue
          </button>
        )
      }
    >
      {/* Pairs grid - shown in pairs_only and pairs_and_bundle modes */}
      {(mode === 'pairs_only' || mode === 'pairs_and_bundle') && (
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          variants={gridVariants}
          initial="hidden"
          animate="visible"
        >
          {suggestions.map((item, index) => (
            <UpsellItemCard
              key={item.id}
              item={item}
              onAdd={handleAddItem}
              hideCurrencySymbol={hideCurrencySymbol}
              index={index}
            />
          ))}
        </motion.div>
      )}

      {/* Divider - shown only in pairs_and_bundle mode */}
      {mode === 'pairs_and_bundle' && (
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            or make it a bundle
          </span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
      )}

      {/* Bundle card - shown in bundle_only and pairs_and_bundle modes */}
      {matchingBundle && (mode === 'bundle_only' || mode === 'pairs_and_bundle') && (
        <BundlePromoCard
          bundle={matchingBundle}
          onAccept={handleAcceptBundle}
          hideCurrencySymbol={hideCurrencySymbol}
          isHero={mode === 'bundle_only'}
        />
      )}
    </UpsellFullScreenLayout>
  )
})

// --- Bundle promo card (internal) ---

interface BundlePromoCardProps {
  bundle: BundleWithSlots
  onAccept: () => void
  hideCurrencySymbol?: boolean
  isHero: boolean
}

function BundlePromoCard({ bundle, onAccept, hideCurrencySymbol, isHero }: BundlePromoCardProps) {
  const savings =
    bundle.pricing_type === 'discount' && bundle.discount_percent
      ? `Save ${bundle.discount_percent}%`
      : bundle.pricing_type === 'fixed' && bundle.fixed_price
        ? `Only ${formatPrice(bundle.fixed_price, { hideCurrencySymbol })}`
        : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={`overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white shadow-sm ${
        isHero ? 'mx-auto max-w-md' : ''
      }`}
    >
      {/* Bundle image for hero mode */}
      {isHero && bundle.image_url && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100">
          <OptimizedImage
            src={bundle.image_url}
            alt={bundle.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 448px"
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
            <Package className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">{bundle.name}</h3>
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
            </div>
            {bundle.description && (
              <p className="mt-0.5 text-sm text-gray-500">{bundle.description}</p>
            )}
          </div>
        </div>

        {/* Slot pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {bundle.slots.map((slot) => (
            <span
              key={slot.id}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
            >
              {slot.pick_count}x {slot.name}
            </span>
          ))}
        </div>

        {/* Savings + CTA */}
        <div className="mt-4 flex items-center gap-3">
          {savings && (
            <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
              {savings}
            </span>
          )}
          <button
            onClick={onAccept}
            className="ml-auto rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            type="button"
          >
            Upgrade to Bundle
          </button>
        </div>
      </div>
    </motion.div>
  )
}
