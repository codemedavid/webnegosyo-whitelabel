'use client'

import { memo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, Sparkles } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { MenuItem, UpgradeUpsell } from '@/types/database'

interface UpgradeUpsellModalProps {
  open: boolean
  onClose: () => void
  onUpgrade: (upgradeItem: MenuItem) => void
  sourceItem: MenuItem
  upgrade: UpgradeUpsell
  tenantId?: string
  /** Override z-index class for preview mode */
  zIndexClass?: string
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const sheetVariants = {
  hidden: { y: '100%' },
  visible: {
    y: 0,
    transition: { type: 'spring' as const, damping: 30, stiffness: 300 },
  },
  exit: {
    y: '100%',
    transition: { duration: 0.2 },
  },
}

const desktopVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 16,
    transition: { duration: 0.15 },
  },
}

function ComparisonCard({
  item,
  label,
  isUpgrade,
}: {
  item: MenuItem
  label: string
  isUpgrade: boolean
}) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="relative flex-1 rounded-2xl p-4 text-center transition-all"
      style={{
        border: isUpgrade ? '2px solid var(--pd-popup-button)' : '1px solid var(--pd-popup-border)',
        backgroundColor: isUpgrade
          ? 'color-mix(in srgb, var(--pd-popup-button) 8%, var(--pd-popup-bg))'
          : 'var(--pd-popup-bg)',
        boxShadow: isUpgrade
          ? '0 4px 20px 0 color-mix(in srgb, var(--pd-popup-button) 15%, transparent)'
          : '0 1px 3px 0 rgb(0 0 0 / 0.04)',
      }}
    >
      {/* Star badge on upgrade card */}
      {isUpgrade && (
        <div
          className="absolute -top-2.5 -right-2.5 flex h-7 w-7 items-center justify-center rounded-full text-xs"
          style={{
            backgroundColor: 'var(--pd-popup-button)',
            color: 'var(--pd-popup-button-text)',
          }}
        >
          ★
        </div>
      )}

      {/* Label badge */}
      <div
        className="mb-3 inline-block rounded-lg px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{
          backgroundColor: isUpgrade ? 'var(--pd-popup-button)' : 'var(--pd-popup-border)',
          color: isUpgrade ? 'var(--pd-popup-button-text)' : 'var(--pd-popup-title)',
        }}
      >
        {label}
      </div>

      {/* Item image */}
      {item.image_url && (
        <div
          className="relative mx-auto mb-3 h-24 w-24 overflow-hidden rounded-2xl"
          style={{
            boxShadow: isUpgrade
              ? '0 4px 12px 0 color-mix(in srgb, var(--pd-popup-button) 20%, transparent)'
              : 'none',
          }}
        >
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
      )}

      {/* Item name */}
      <p
        className="text-sm font-semibold truncate"
        style={{ color: 'var(--pd-popup-title)' }}
      >
        {item.name}
      </p>

      {/* Price */}
      <div className="mt-1.5">
        {hasDiscount && (
          <span
            className="text-xs line-through mr-1"
            style={{ color: 'var(--pd-popup-description)' }}
          >
            {formatPrice(item.price)}
          </span>
        )}
        <span
          className={isUpgrade ? 'text-xl font-bold' : 'text-base font-bold'}
          style={{ color: isUpgrade ? 'var(--pd-popup-button)' : 'var(--pd-popup-price)' }}
        >
          {formatPrice(displayPrice)}
        </span>
      </div>
    </div>
  )
}

function ModalContent({
  onClose,
  onUpgrade,
  sourceItem,
  upgrade,
}: {
  onClose: () => void
  onUpgrade: (item: MenuItem) => void
  sourceItem: MenuItem
  upgrade: UpgradeUpsell
}) {
  const header = upgrade.upgradeHeader || `Upgrade your ${sourceItem.name}?`
  const sourceLabel = upgrade.sourceLabel || 'Current'
  const targetLabel = upgrade.targetLabel || 'Upgrade'

  return (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between border-b p-4 sm:p-5"
        style={{ borderColor: 'var(--pd-popup-border)' }}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Sparkles className="h-5 w-5 shrink-0" style={{ color: 'var(--pd-popup-button)' }} />
          <p
            className="text-base sm:text-lg font-bold truncate"
            style={{ color: 'var(--pd-popup-title)' }}
          >
            {header}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 ml-2 rounded-full p-2 transition-colors hover:bg-black/5"
          style={{ color: 'var(--pd-popup-description)' }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Comparison */}
      <div className="flex items-stretch gap-3 p-4 sm:p-5">
        <ComparisonCard
          item={sourceItem}
          label={sourceLabel}
          isUpgrade={false}
        />

        {/* Arrow separator */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1">
          <motion.div
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ArrowRight
              className="h-5 w-5"
              style={{ color: 'var(--pd-popup-button)' }}
            />
          </motion.div>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--pd-popup-button)' }}
          >
            Upgrade
          </span>
        </div>

        <ComparisonCard
          item={upgrade.targetItem}
          label={targetLabel}
          isUpgrade={true}
        />
      </div>

      {/* Actions — vertical stack */}
      <div
        className="border-t p-4 sm:p-5"
        style={{ borderColor: 'var(--pd-popup-border)' }}
      >
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center h-12 rounded-xl text-sm font-semibold tracking-wide"
          style={{
            backgroundColor: 'var(--pd-popup-button)',
            color: 'var(--pd-popup-button-text)',
            boxShadow: '0 4px 14px 0 color-mix(in srgb, var(--pd-popup-button) 40%, transparent)',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onUpgrade(upgrade.targetItem)
          }}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {targetLabel} — {formatPrice(
            upgrade.targetItem.discounted_price && upgrade.targetItem.discounted_price < upgrade.targetItem.price
              ? upgrade.targetItem.discounted_price
              : upgrade.targetItem.price
          )}
        </motion.button>
        <button
          className="mt-3 w-full py-1 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--pd-popup-description)' }}
          onClick={onClose}
        >
          No thanks, keep my current order
        </button>
      </div>
    </>
  )
}

export const UpgradeUpsellModal = memo(function UpgradeUpsellModal({
  open,
  onClose,
  onUpgrade,
  sourceItem,
  upgrade,
  tenantId,
  zIndexClass = 'z-50',
}: UpgradeUpsellModalProps) {
  const shownTrackedRef = useRef(false)

  useEffect(() => {
    if (open && tenantId && !shownTrackedRef.current) {
      shownTrackedRef.current = true
      trackAnalyticsEventAction(tenantId, 'upsell_shown', {
        source: 'upgrade',
        sourceItemId: sourceItem.id,
        sourceItemName: sourceItem.name,
        targetItemId: upgrade.targetItem.id,
        targetItemName: upgrade.targetItem.name,
      })
    }
    if (!open) {
      shownTrackedRef.current = false
    }
  }, [open, tenantId, sourceItem.id, sourceItem.name, upgrade.targetItem.id, upgrade.targetItem.name])

  const handleUpgradeWithTracking = (upgradeItem: MenuItem) => {
    if (tenantId) {
      trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
        source: 'upgrade',
        itemId: upgradeItem.id,
        itemName: upgradeItem.name,
        price: upgradeItem.discounted_price && upgradeItem.discounted_price < upgradeItem.price
          ? upgradeItem.discounted_price
          : upgradeItem.price,
        sourceItemId: sourceItem.id,
      })
    }
    onUpgrade(upgradeItem)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} bg-black/60 backdrop-blur-sm`}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
          />

          {/* Mobile: Bottom sheet */}
          <motion.div
            className={`fixed inset-x-0 bottom-0 ${zIndexClass} max-h-[80vh] overflow-y-auto rounded-t-2xl sm:hidden`}
            style={{ backgroundColor: 'var(--pd-popup-bg)' }}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Drag indicator */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-8 rounded-full bg-black/15" />
            </div>
            <ModalContent
              onClose={onClose}
              onUpgrade={handleUpgradeWithTracking}
              sourceItem={sourceItem}
              upgrade={upgrade}
            />
          </motion.div>

          {/* Desktop: Centered modal */}
          <motion.div
            className={`fixed inset-0 ${zIndexClass} hidden items-center justify-center sm:flex`}
          >
            <motion.div
              className="w-full max-w-lg rounded-2xl"
              style={{
                backgroundColor: 'var(--pd-popup-bg)',
                boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25), 0 12px 24px -8px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.03)',
              }}
              variants={desktopVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              <ModalContent
                onClose={onClose}
                onUpgrade={handleUpgradeWithTracking}
                sourceItem={sourceItem}
                upgrade={upgrade}
              />
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})
