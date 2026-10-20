'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CartBundleItem, CartItem } from '@/types/database'
import {
  getCheckoutGovSetupAction,
  previewCheckoutGovAction,
  type CheckoutGovPreview,
  type CheckoutGovSetup,
} from '@/app/actions/gov-discount-checkout'
import { buildVoucherPreviewLines } from '@/lib/vouchers/checkout-preview-lines'
import { cartFingerprint } from '@/lib/vouchers/checkout-codes'
import type { CheckoutGovClaim } from '@/lib/gov-discount-checkout/checkout-government'
import type { OrderDiscountLine } from '@/lib/order-totals'

interface UseCheckoutGovClaimInput {
  tenantId: string | null
  items: readonly CartItem[]
  bundleItems: readonly CartBundleItem[]
  validDeliveryFee: number | null
  serviceChargeAmount: number
  /** What the customer's vouchers take off — the higher of the two applies. */
  voucherReduction: number
  isCheckoutComplete?: boolean
}

export interface CheckoutGovClaimState {
  /** Null when the store has not set up Senior/PWD discounts (no field shown). */
  govSetup: CheckoutGovSetup | null
  govClaim: CheckoutGovClaim | null
  govPreview: CheckoutGovPreview | null
  isCheckingGov: boolean
  applyGovClaim: (claim: CheckoutGovClaim) => Promise<void>
  removeGovClaim: () => void
  /** The Senior/PWD lines when they apply (replacing the vouchers), else null. */
  govLines: readonly OrderDiscountLine[] | null
}

/**
 * The checkout's Senior / PWD claim: who is claiming, and a server preview of
 * what it is worth. Like the voucher preview it is dropped the moment the cart
 * moves under it; the order re-prices the claim on the server regardless.
 */
export function useCheckoutGovClaim({
  tenantId,
  items,
  bundleItems,
  validDeliveryFee,
  serviceChargeAmount,
  voucherReduction,
  isCheckoutComplete = false,
}: UseCheckoutGovClaimInput): CheckoutGovClaimState {
  const [govSetup, setGovSetup] = useState<CheckoutGovSetup | null>(null)
  const [govClaim, setGovClaim] = useState<CheckoutGovClaim | null>(null)
  const [preview, setPreview] = useState<{ result: CheckoutGovPreview; fingerprint: string } | null>(null)
  const [isCheckingGov, setIsCheckingGov] = useState(false)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!tenantId) return
    let isCurrent = true
    getCheckoutGovSetupAction(tenantId)
      .then((setup) => {
        if (isCurrent) setGovSetup(setup)
      })
      .catch(() => undefined)
    return () => {
      isCurrent = false
    }
  }, [tenantId])

  const lines = useMemo(() => buildVoucherPreviewLines(items, bundleItems), [items, bundleItems])
  const fingerprint = useMemo(
    () => `${cartFingerprint(lines, validDeliveryFee, serviceChargeAmount)}#${voucherReduction}`,
    [lines, validDeliveryFee, serviceChargeAmount, voucherReduction],
  )

  const runPreview = useCallback(
    async (claim: CheckoutGovClaim) => {
      if (!tenantId || lines.length === 0) return
      const seq = ++requestSeq.current
      setIsCheckingGov(true)
      try {
        const result = await previewCheckoutGovAction({
          tenantId,
          claim,
          lines: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity, subtotal: line.subtotal })),
          serviceCharge: serviceChargeAmount,
          deliveryFee: validDeliveryFee,
          otherReduction: voucherReduction,
        })
        if (seq === requestSeq.current) setPreview({ result, fingerprint })
      } finally {
        if (seq === requestSeq.current) setIsCheckingGov(false)
      }
    },
    [tenantId, lines, serviceChargeAmount, validDeliveryFee, voucherReduction, fingerprint],
  )

  // Re-price a held claim whenever the cart (or the vouchers) move.
  useEffect(() => {
    if (!govClaim || isCheckoutComplete) return
    if (preview?.fingerprint === fingerprint) return
    void runPreview(govClaim)
  }, [govClaim, fingerprint, preview?.fingerprint, runPreview, isCheckoutComplete])

  const applyGovClaim = useCallback(
    async (claim: CheckoutGovClaim) => {
      setGovClaim(claim)
      await runPreview(claim)
    },
    [runPreview],
  )

  const removeGovClaim = useCallback(() => {
    requestSeq.current += 1
    setGovClaim(null)
    setPreview(null)
    setIsCheckingGov(false)
  }, [])

  const govPreview = preview && preview.fingerprint === fingerprint ? preview.result : null
  const govLines = govClaim && govPreview?.status === 'applied' ? govPreview.lines : null

  return { govSetup, govClaim, govPreview, isCheckingGov, applyGovClaim, removeGovClaim, govLines }
}
