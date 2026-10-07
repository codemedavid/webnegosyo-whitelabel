'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { CartItem, CartBundleItem } from '@/types/database'
import { validateVoucherAction } from '@/app/actions/vouchers'
import { buildVoucherPreviewLines } from '@/lib/vouchers/checkout-preview-lines'
import {
  addCode,
  cartFingerprint,
  discountLinesFrom,
  isPreviewStale,
  removeCode,
  EMPTY_CHECKOUT_VOUCHER_STATE,
  type CheckoutVoucherState,
} from '@/lib/vouchers/checkout-codes'

interface UseCheckoutVouchersInput {
  tenantId: string | null
  items: readonly CartItem[]
  bundleItems: readonly CartBundleItem[]
  validDeliveryFee: number | null
  serviceChargeAmount: number
  outletId: string | null
  /**
   * The order has been placed. Its discounts are frozen on the confirmation
   * snapshot and clearing the cart is what makes the preview look stale, so
   * re-pricing then would only spend a server action on an empty cart.
   */
  isCheckoutComplete?: boolean
}

/** Owns voucher preview state and races for every checkout design. */
export function useCheckoutVouchers({ tenantId, items, bundleItems, validDeliveryFee,
  serviceChargeAmount, outletId, isCheckoutComplete = false,
}: UseCheckoutVouchersInput) {
  // Vouchers. The preview is a rendering hint only — the server re-prices from
  // the codes at order time — so it is dropped the moment the cart moves under
  // it rather than shown stale.
  const [voucherState, setVoucherState] = useState<CheckoutVoucherState>(
    EMPTY_CHECKOUT_VOUCHER_STATE
  )
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false)

  // Bundle slots are priced by the server too, so they belong in both the
  // request and the fingerprint. Leaving them out of the fingerprint left a
  // preview looking fresh after the customer changed a bundle under it.
  const voucherPreviewLines = useMemo(
    () => buildVoucherPreviewLines(items, bundleItems),
    [items, bundleItems]
  )

  const voucherFingerprint = useMemo(
    () => cartFingerprint(voucherPreviewLines, validDeliveryFee, serviceChargeAmount),
    [voucherPreviewLines, validDeliveryFee, serviceChargeAmount],
  )

  // A stale preview contributes nothing: the summary shows full price for a
  // moment rather than a discount the server will not honour.
  const voucherPreview = isPreviewStale(voucherState, voucherFingerprint)
    ? null
    : voucherState.preview
  const effectiveDiscounts = useMemo(() => discountLinesFrom(voucherPreview), [voucherPreview])

  /**
   * Re-prices whatever codes are currently entered.
   *
   * Runs on every code change and whenever the cart moves, because both change
   * what a voucher is worth. Guarded on the fingerprint captured before the
   * request so a slow reply cannot overwrite a newer cart.
   */
  // Only the newest voucher request may write its answer. Applying A then B
  // quickly used to let the slower [A] reply land last and show A's discount
  // as if it were [A, B]'s — the fingerprint only tracks the cart, not codes.
  const voucherRequestSeqRef = useRef(0)

  const refreshVoucherPreview = useCallback(
    async (codes: readonly string[], fingerprint: string) => {
      const requestSeq = ++voucherRequestSeqRef.current
      if (codes.length === 0) {
        setVoucherState({ codes: [], preview: null, previewFingerprint: null })
        setIsCheckingVoucher(false)
        return
      }

      if (!tenantId) return

      setIsCheckingVoucher(true)
      try {
        const result = await validateVoucherAction({
          tenantId,
          codes: [...codes],
          lines: voucherPreviewLines,
          deliveryFee: validDeliveryFee,
          serviceCharge: serviceChargeAmount,
          channel: 'checkout',
          outletId: outletId ?? null,
        })
        if (requestSeq !== voucherRequestSeqRef.current) return

        if (!result.success || !result.data) {
          toast.error(result.error ?? 'Could not check that voucher')
          return
        }

        setVoucherState((prev) => ({
          ...prev,
          preview: result.data ?? null,
          previewFingerprint: fingerprint,
        }))
      } catch (error) {
        if (requestSeq !== voucherRequestSeqRef.current) return
        console.error('[Checkout] Voucher check failed:', error)
        toast.error('Could not check that voucher. Please try again.')
      } finally {
        // A thrown request used to leave the spinner on for good.
        if (requestSeq === voucherRequestSeqRef.current) setIsCheckingVoucher(false)
      }
    },
    [tenantId, voucherPreviewLines, validDeliveryFee, serviceChargeAmount, outletId]
  )

  const applyVoucherCode = useCallback(
    async (raw: string) => {
      const next = addCode(voucherState, raw)
      if (next === voucherState) return
      setVoucherState(next)
      await refreshVoucherPreview(next.codes, voucherFingerprint)
    },
    [voucherState, refreshVoucherPreview, voucherFingerprint]
  )

  const removeVoucherCode = useCallback(
    async (raw: string) => {
      const next = removeCode(voucherState, raw)
      if (next === voucherState) return
      setVoucherState(next)
      await refreshVoucherPreview(next.codes, voucherFingerprint)
    },
    [voucherState, refreshVoucherPreview, voucherFingerprint]
  )

  // The cart moved under an applied code — re-price rather than show a
  // discount the server will not honour. Not once the order is placed: the
  // cart moved because checkout emptied it.
  useEffect(() => {
    if (isCheckoutComplete || !isPreviewStale(voucherState, voucherFingerprint)) return
    void refreshVoucherPreview(voucherState.codes, voucherFingerprint)
  }, [isCheckoutComplete, voucherState, voucherFingerprint, refreshVoucherPreview])

  return {
    voucherCodes: voucherState.codes,
    voucherPreview,
    effectiveDiscounts,
    isCheckingVoucher,
    applyVoucherCode,
    removeVoucherCode,
  }
}
