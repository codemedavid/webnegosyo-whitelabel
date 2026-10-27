import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { checkoutBlockers, orderTypeForMode, type DeliveryFeeStatus } from '@/lib/checkout/blockers'
import { availablePaymentMethods } from '@/lib/checkout/payments'
import { rewardEstimateCentavos } from '@/lib/checkout/reward'
import { checkoutTotals, minimumOrderShortfall } from '@/lib/checkout/totals'
import { voucherDiscount, type VoucherTerms } from '@/lib/checkout/voucher'
import type { AppOrderDraft } from '@/lib/contract'
import { useAppConfig, useCatalog, useDeliveryQuote, useLoyalty, usePlaceOrder } from '@/lib/data/hooks'
import { toCentavos } from '@/lib/money'
import { useCart, useCartSummary } from '@/lib/stores/cart'
import { useSession } from '@/lib/stores/session'

/** Everything the review screen decides, kept out of the screen so it stays layout. */
export function useCheckout() {
  const { data: config } = useAppConfig()
  const { data: catalog } = useCatalog()
  const { data: loyalty } = useLoyalty()
  const isMember = useSession((state) => state.status === 'member')
  const { lines, mode, outletId, clear } = useCart()
  const { itemCount, subtotalCentavos } = useCartSummary()
  const placeOrder = usePlaceOrder()

  const [addressDraft, setAddressDraft] = useState('')
  const [quotedAddress, setQuotedAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [pickedPaymentId, setPickedPaymentId] = useState<string | null>(null)
  const [voucher, setVoucher] = useState<VoucherTerms | null>(null)
  const [isUsingReward, setIsUsingReward] = useState(false)

  const features = config?.features
  const isDelivery = mode === 'delivery'
  const orderType = catalog ? orderTypeForMode(mode, catalog.orderTypes) : undefined
  const outlet = catalog?.outlets.find((candidate) => candidate.id === outletId) ?? (features?.multiBranch ? undefined : catalog?.outlets[0])
  const paymentMethods = useMemo(
    () => (catalog && features ? availablePaymentMethods(catalog.paymentMethods, features.onlinePayments, orderType?.id) : []),
    [catalog, features, orderType?.id],
  )
  const paymentMethod = paymentMethods.find((method) => method.id === pickedPaymentId) ?? paymentMethods[0]
  const reward = isMember ? loyalty?.rewards[0] : undefined
  const quote = useDeliveryQuote(outlet?.id ?? null, quotedAddress, isDelivery)

  // The reward can only cover something in the bag; with nothing to cover it is off, whatever the switch said.
  const rewardEstimate = reward ? rewardEstimateCentavos(lines) : 0
  const canUseReward = rewardEstimate > 0
  const isRewardOn = isUsingReward && canUseReward
  const rewardCentavos = isRewardOn ? rewardEstimate : 0
  const voucherResult = voucher ? voucherDiscount(voucher, subtotalCentavos - rewardCentavos) : null
  const totals = checkoutTotals({
    subtotalCentavos,
    discountCentavos: rewardCentavos + (voucherResult?.discountCentavos ?? 0),
    deliveryFeeCentavos: isDelivery && quote.data ? toCentavos(quote.data.fee) : 0,
  })
  const deliveryFee: DeliveryFeeStatus =
    quotedAddress === '' ? 'unconfirmed' : quote.isFetching ? 'quoting' : quote.isError || !quote.data ? 'failed' : 'ready'
  const shortfallCentavos = minimumOrderShortfall(subtotalCentavos, orderType?.minimumOrder)
  const blockers = checkoutBlockers({
    itemCount,
    isMember,
    mode,
    orderType,
    outlet,
    needsOutlet: features?.multiBranch ?? false,
    paymentMethodId: paymentMethod?.id ?? null,
    deliveryAddress: isDelivery ? addressDraft : '',
    deliveryFee,
    shortfallCentavos,
  })

  const submit = () => {
    if (!orderType || !paymentMethod) return
    const draft: AppOrderDraft = {
      orderTypeId: orderType.id,
      outletId: outlet?.id ?? null,
      lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, selections: line.selections })),
      paymentMethodId: paymentMethod.id,
      voucherCode: voucherResult?.isApplied && voucher ? voucher.code : null,
      rewardId: rewardCentavos > 0 && reward ? reward.id : null,
      deliveryAddress: isDelivery ? addressDraft.trim() : null,
      notes: notes.trim(),
    }
    placeOrder.mutate(draft, {
      onSuccess: (order) => {
        router.replace({ pathname: '/order/[id]', params: { id: order.id } })
        clear()
      },
    })
  }

  return {
    isReady: config !== undefined && catalog !== undefined,
    features,
    catalog,
    lines,
    itemCount,
    mode,
    orderType,
    outlet,
    isMember,
    address: {
      draft: addressDraft,
      // Any edit voids the quote: the fee shown must be for the address that is sent.
      setDraft: (next: string) => {
        setAddressDraft(next)
        setQuotedAddress('')
      },
      commit: () => {
        const next = addressDraft.trim()
        // Re-confirming the same address after a failed quote asks again.
        if (next === quotedAddress && quote.isError) void quote.refetch()
        else setQuotedAddress(next)
      },
      quote: quote.data,
      isQuoting: quote.isFetching,
      hasQuoteFailed: quote.isError,
    },
    shortfallCentavos,
    notes,
    setNotes,
    paymentMethods,
    paymentMethod,
    pickPayment: setPickedPaymentId,
    voucher,
    voucherResult,
    setVoucher,
    reward,
    rewardCentavos,
    canUseReward,
    isUsingReward: isRewardOn,
    setIsUsingReward,
    totals,
    blockers,
    submit,
    isPlacing: placeOrder.isPending,
    placeError: placeOrder.error instanceof Error ? placeOrder.error.message : null,
  }
}

export type CheckoutModel = ReturnType<typeof useCheckout>
