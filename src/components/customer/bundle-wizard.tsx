'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCart } from '@/hooks/useCart'
import { useAnalyticsContext } from '@/components/customer/analytics-provider'
import {
  calculateSlotBundleBasePrice,
  calculateSlotBundleExtras,
  calculateSlotBundleSavings,
  formatPrice,
} from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type {
  BundleWithSlots,
  BundleSlot,
  BundleSlotPriceOverride,
  CartBundleSlotSelection,
  CartBundleItem,
} from '@/types/database'
import { BundleWizardSlotScreen } from './bundle-wizard-slot-screen'
import { BundleWizardCustomizeScreen } from './bundle-wizard-customize-screen'
import { BundleWizardReviewScreen } from './bundle-wizard-review-screen'

type StepType = 'slot-select' | 'customize' | 'review'

interface WizardStep {
  type: StepType
  slotIndex: number // which slot we're currently on
}

interface BundleWizardProps {
  open: boolean
  onClose: () => void
  bundle: BundleWithSlots | null
  branding: BrandingColors
  hideCurrencySymbol?: boolean
}

function getPriceOverride(
  slot: BundleSlot,
  menuItemId: string
): BundleSlotPriceOverride | undefined {
  return slot.price_overrides?.find((o) => o.menu_item_id === menuItemId)
}

function getPriceOverrideBySlotId(
  slots: BundleSlot[],
  slotId: string,
  menuItemId: string
): BundleSlotPriceOverride | undefined {
  const slot = slots.find((s) => s.id === slotId)
  if (!slot) return undefined
  return getPriceOverride(slot, menuItemId)
}

function slotNeedsCustomize(
  slot: BundleSlot,
  selections: CartBundleSlotSelection[]
): boolean {
  return selections.some((sel) => {
    const item = slot.items?.find((i) => i.id === sel.menuItemId)
    if (!item) return false
    return (
      (item.variation_types?.length ?? 0) > 0 ||
      (item.variations?.length ?? 0) > 0 ||
      (item.addons?.length ?? 0) > 0
    )
  })
}

function buildTempCartBundleItem(
  bundle: BundleWithSlots,
  slotSelections: Map<string, CartBundleSlotSelection[]>
): CartBundleItem {
  const allSlots = Array.from(slotSelections.values()).flat()
  return {
    id: '__wizard__',
    bundleId: bundle.id,
    bundleName: bundle.name,
    slots: allSlots,
    quantity: 1,
    pricingType: bundle.pricing_type,
    basePrice: bundle.pricing_type === 'fixed' ? (bundle.fixed_price ?? 0) : 0,
    discountPercent: bundle.discount_percent,
    subtotal: 0,
  }
}

export function BundleWizard({
  open,
  onClose,
  bundle,
  branding,
  hideCurrencySymbol,
}: BundleWizardProps) {
  const { addBundleToCart } = useCart()
  const { trackEvent } = useAnalyticsContext()

  const slots = useMemo(() => bundle?.slots ?? [], [bundle?.slots])

  const [step, setStep] = useState<WizardStep>({ type: 'slot-select', slotIndex: 0 })
  // Map of slot.id -> CartBundleSlotSelection[]
  const [slotSelections, setSlotSelections] = useState<Map<string, CartBundleSlotSelection[]>>(
    () => new Map()
  )

  const totalSteps = slots.length + 1 // slots + review

  // Track wizard open
  useEffect(() => {
    if (open && bundle) {
      trackEvent('bundle_wizard_started', {
        bundleId: bundle.id,
        bundleName: bundle.name,
        slotCount: slots.length,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const progressIndex = useMemo(() => {
    if (step.type === 'review') return totalSteps - 1
    return step.slotIndex
  }, [step, totalSteps])

  // Running total for the bottom bar
  const runningTotal = useMemo(() => {
    if (!bundle) return 0
    const tempItem = buildTempCartBundleItem(bundle, slotSelections)
    const base = calculateSlotBundleBasePrice(tempItem)
    const allSels = Array.from(slotSelections.values()).flat()
    const extras = calculateSlotBundleExtras(allSels)
    return base + extras
  }, [bundle, slotSelections])

  const handleClose = useCallback(() => {
    // Track abandonment if the wizard has progressed past the first slot
    if (bundle && step.slotIndex > 0) {
      trackEvent('bundle_wizard_abandoned', {
        bundleId: bundle.id,
        lastCompletedStep: step.slotIndex,
        totalSteps,
      })
    }
    setStep({ type: 'slot-select', slotIndex: 0 })
    setSlotSelections(new Map())
    onClose()
  }, [onClose, bundle, step.slotIndex, totalSteps, trackEvent])

  const handleBack = useCallback(() => {
    if (step.type === 'customize') {
      // Go back to the slot-select for this slot
      setStep({ type: 'slot-select', slotIndex: step.slotIndex })
    } else if (step.type === 'slot-select') {
      if (step.slotIndex === 0) {
        handleClose()
      } else {
        setStep({ type: 'slot-select', slotIndex: step.slotIndex - 1 })
      }
    } else if (step.type === 'review') {
      // Go back to the last slot's slot-select
      setStep({ type: 'slot-select', slotIndex: slots.length - 1 })
    }
  }, [step, slots.length, handleClose])

  const handleSlotComplete = useCallback(
    (selections: CartBundleSlotSelection[]) => {
      const slot = slots[step.slotIndex]
      setSlotSelections((prev) => {
        const next = new Map(prev)
        next.set(slot.id, selections)
        return next
      })

      // Track each slot selection
      if (bundle) {
        selections.forEach((sel) => {
          trackEvent('bundle_slot_selected', {
            bundleId: bundle.id,
            slotId: slot.id,
            slotName: slot.name,
            menuItemId: sel.menuItemId,
            stepNumber: step.slotIndex + 1,
          })
        })
      }

      const needsCustomize = slotNeedsCustomize(slot, selections)
      if (needsCustomize) {
        setStep({ type: 'customize', slotIndex: step.slotIndex })
      } else {
        // Move to next slot or review
        if (step.slotIndex < slots.length - 1) {
          setStep({ type: 'slot-select', slotIndex: step.slotIndex + 1 })
        } else {
          setStep({ type: 'review', slotIndex: step.slotIndex })
        }
      }
    },
    [step.slotIndex, slots, bundle, trackEvent]
  )

  const handleCustomizeComplete = useCallback(
    (updatedSelections: CartBundleSlotSelection[]) => {
      const slot = slots[step.slotIndex]
      setSlotSelections((prev) => {
        const next = new Map(prev)
        next.set(slot.id, updatedSelections)
        return next
      })

      if (step.slotIndex < slots.length - 1) {
        setStep({ type: 'slot-select', slotIndex: step.slotIndex + 1 })
      } else {
        setStep({ type: 'review', slotIndex: step.slotIndex })
      }
    },
    [step.slotIndex, slots]
  )

  const handleEditSlot = useCallback(
    (slotIndex: number) => {
      setStep({ type: 'slot-select', slotIndex })
    },
    []
  )

  const handleAddToCart = useCallback(() => {
    if (!bundle) return

    const allSlotSels = Array.from(slotSelections.values()).flat()

    const cartItem: Omit<CartBundleItem, 'id' | 'subtotal'> = {
      bundleId: bundle.id,
      bundleName: bundle.name,
      slots: allSlotSels,
      quantity: 1,
      pricingType: bundle.pricing_type,
      basePrice: bundle.pricing_type === 'fixed' ? (bundle.fixed_price ?? 0) : 0,
      discountPercent: bundle.discount_percent,
    }

    addBundleToCart(cartItem)

    // Track analytics
    const tempItem = buildTempCartBundleItem(bundle, slotSelections)
    const totalPrice = calculateSlotBundleBasePrice(tempItem) + calculateSlotBundleExtras(allSlotSels)
    const savingsAmount = calculateSlotBundleSavings(tempItem)
    trackEvent('bundle_added_to_cart', {
      bundleId: bundle.id,
      bundleName: bundle.name,
      totalPrice,
      savingsAmount,
    })

    toast.success(`${bundle.name} added to cart!`)
    handleClose()
  }, [bundle, slotSelections, addBundleToCart, handleClose, trackEvent])

  if (!open || !bundle) return null

  const currentSlot = slots[step.slotIndex]

  const stepLabel = step.type === 'review'
    ? `Review (${totalSteps} of ${totalSteps})`
    : `Step ${step.slotIndex + 1} of ${totalSteps}`

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: branding.background }}
    >
      {/* Progress bar — segmented */}
      <div className="flex gap-1 px-4 pt-3 shrink-0">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor:
                i <= progressIndex ? branding.primary : branding.border,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: branding.border }}
      >
        <button
          type="button"
          className="rounded-full p-1.5 transition-colors hover:bg-black/5 flex items-center gap-1"
          style={{ color: branding.textSecondary }}
          onClick={handleBack}
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h1 className="text-base font-bold leading-tight" style={{ color: branding.textPrimary }}>
            {bundle.name}
          </h1>
          <p className="text-xs" style={{ color: branding.textMuted }}>
            {stepLabel}
          </p>
        </div>

        <button
          type="button"
          className="rounded-full p-1.5 transition-colors hover:bg-black/5"
          style={{ color: branding.textSecondary }}
          onClick={handleClose}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {step.type === 'slot-select' && currentSlot && (
          <BundleWizardSlotScreen
            slot={currentSlot}
            existingSelections={slotSelections.get(currentSlot.id) ?? []}
            getPriceOverride={(slotId, menuItemId) =>
              getPriceOverrideBySlotId(slots, slotId, menuItemId)
            }
            branding={branding}
            hideCurrencySymbol={hideCurrencySymbol}
            onComplete={handleSlotComplete}
          />
        )}

        {step.type === 'customize' && currentSlot && (
          <BundleWizardCustomizeScreen
            slot={currentSlot}
            selections={slotSelections.get(currentSlot.id) ?? []}
            branding={branding}
            hideCurrencySymbol={hideCurrencySymbol}
            onComplete={handleCustomizeComplete}
          />
        )}

        {step.type === 'review' && (
          <BundleWizardReviewScreen
            bundle={bundle}
            slots={slots}
            slotSelections={slotSelections}
            branding={branding}
            hideCurrencySymbol={hideCurrencySymbol}
            runningTotal={runningTotal}
            onEditSlot={handleEditSlot}
            onAddToCart={handleAddToCart}
          />
        )}
      </div>

      {/* Running total bottom bar — not shown on review (review has its own) */}
      {step.type !== 'review' && (
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2 border-t"
          style={{ borderColor: branding.border, backgroundColor: branding.cards }}
        >
          <span className="text-xs" style={{ color: branding.textMuted }}>
            Running total
          </span>
          <span className="text-sm font-bold" style={{ color: branding.textPrimary }}>
            {formatPrice(runningTotal, { hideCurrencySymbol })}
          </span>
        </div>
      )}
    </div>
  )
}
