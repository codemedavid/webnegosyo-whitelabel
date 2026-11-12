import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { AppApiError } from '@/lib/api/app-client'
import { checkoutBlockers, orderTypeForMode } from '@/lib/checkout/blockers'
import {
  deliveryFeeStatus,
  displayedDeliveryFeeCentavos,
  isQuoteExpired,
  quoteRequestFor,
  quoteSummary,
  requoteOutcome,
  type PickedPlace,
} from '@/lib/checkout/delivery-quote'
import { buildOrderDraft, draftFingerprint, stableStringify } from '@/lib/checkout/draft'
import { attemptAfterFailure, attemptFor, mintIdempotencyKey } from '@/lib/checkout/idempotency'
import { availablePaymentMethods } from '@/lib/checkout/payments'
import { placeOrderFailure, type PlaceOrderFailure } from '@/lib/checkout/place-order-outcome'
import { answersToSend, questionsFor, unansweredQuestions } from '@/lib/checkout/questions'
import { rewardEstimateCentavos } from '@/lib/checkout/reward'
import { checkoutTotals, minimumOrderShortfall } from '@/lib/checkout/totals'
import type { AppDeliveryQuote, AppOrderDelivery } from '@/lib/contract'
import { isRewardAtCheckoutOffered, useAppConfig, useCatalog, useDeliveryQuote, useLoyalty, usePlaceOrder } from '@/lib/data/hooks'
import { formatPeso, toCentavos } from '@/lib/money'
import { useCart, useCartSummary } from '@/lib/stores/cart'
import { useSession } from '@/lib/stores/session'
import { useVoucher } from './use-voucher'

export type { PickedPlace }

const REQUOTE_FAILED = 'We couldn’t refresh the delivery fee. Try again.'

/** A failure on screen, and the checkout it was about (so a fixed bag stops showing it). */
interface ShownFailure {
  failure: PlaceOrderFailure
  context: string
}

/** Refresh an expired courier quote right before placing; null = stop (the reason is returned). */
async function freshQuote(
  current: AppDeliveryQuote,
  refetch: () => Promise<{ data?: AppDeliveryQuote; error: unknown; isError: boolean }>,
): Promise<{ quote: AppDeliveryQuote } | { stop: string }> {
  if (!isQuoteExpired(current, Date.now())) return { quote: current }
  const fresh = await refetch()
  if (fresh.isError || !fresh.data)
    return { stop: fresh.error instanceof AppApiError && fresh.error.code === 'refused' ? fresh.error.message : REQUOTE_FAILED }
  if (requoteOutcome(current, fresh.data) === 'fee_changed')
    return { stop: `The delivery fee is now ${formatPeso(toCentavos(fresh.data.fee))}. Check your total, then place your order.` }
  return { quote: fresh.data }
}

/** Everything the review screen decides, kept out of the screen so it stays layout. */
export function useCheckout() {
  const { data: config } = useAppConfig()
  const { data: catalog } = useCatalog()
  const { data: loyalty } = useLoyalty()
  const isMember = useSession((state) => state.status === 'member')
  const hasName = useSession((state) => Boolean(state.profile?.name?.trim()))
  const { lines, mode, outletId, clear, deliveryPlace, setDeliveryPlace, setCheckoutAttempt, answers, setAnswer } = useCart()
  const { itemCount, subtotalCentavos } = useCartSummary()
  const placeOrder = usePlaceOrder()

  const [notes, setNotes] = useState('')
  const [pickedPaymentId, setPickedPaymentId] = useState<string | null>(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [isUsingReward, setIsUsingReward] = useState(false)
  const [shownFailure, setShownFailure] = useState<ShownFailure | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isRequoting, setIsRequoting] = useState(false)

  const features = config?.features
  const isDelivery = mode === 'delivery'
  const orderType = catalog ? orderTypeForMode(mode, catalog.orderTypes) : undefined
  const outlet = catalog?.outlets.find((candidate) => candidate.id === outletId) ?? (features?.multiBranch ? undefined : catalog?.outlets[0])
  const paymentMethods = useMemo(
    () => (catalog && features ? availablePaymentMethods(catalog.paymentMethods, features.onlinePayments, orderType?.id) : []),
    [catalog, features, orderType?.id],
  )
  const questions = useMemo(() => questionsFor(catalog?.questions, orderType?.id), [catalog?.questions, orderType?.id])
  const paymentMethod = paymentMethods.find((method) => method.id === pickedPaymentId) ?? paymentMethods[0]
  const needsPaymentReference = paymentMethod?.requiresProof ?? false
  const reward = isMember && isRewardAtCheckoutOffered ? loyalty?.rewards[0] : undefined
  const quote = useDeliveryQuote(isDelivery && deliveryPlace ? quoteRequestFor(outlet?.id ?? null, deliveryPlace) : null)
  const voucher = useVoucher({ orderTypeId: orderType?.id, outletId: outlet?.id ?? null, lines, isEnabled: isMember })

  // The reward can only cover something in the bag; with nothing to cover it is off, whatever the switch said.
  const rewardEstimate = reward ? rewardEstimateCentavos(lines) : 0
  const canUseReward = rewardEstimate > 0
  const isRewardOn = isUsingReward && canUseReward
  const rewardCentavos = isRewardOn ? rewardEstimate : 0
  const feeStatus = deliveryFeeStatus({
    hasQuote: quote.data !== undefined,
    isFetching: quote.isFetching,
    errorCode: quote.isError ? (quote.error instanceof AppApiError ? quote.error.code : 'network') : null,
  })
  const deliveryRefusal = feeStatus === 'refused' && quote.error instanceof AppApiError ? quote.error.message : null
  const isFeeReady = isDelivery && feeStatus === 'ready' && quote.data !== undefined
  const totals = checkoutTotals({
    subtotalCentavos,
    discountCentavos: rewardCentavos + voucher.discountCentavos,
    deliveryFeeCentavos: isFeeReady && quote.data ? displayedDeliveryFeeCentavos(quote.data, subtotalCentavos) : 0,
  })
  const shortfallCentavos = minimumOrderShortfall(subtotalCentavos, orderType?.minimumOrder)
  const blockers = checkoutBlockers({
    itemCount,
    isMember,
    hasName,
    mode,
    orderType,
    outlet,
    needsOutlet: features?.multiBranch ?? false,
    paymentMethodId: paymentMethod?.id ?? null,
    hasPaymentMethods: paymentMethods.length > 0,
    needsPaymentReference,
    paymentReference,
    hasDeliveryPlace: deliveryPlace !== null,
    deliveryFee: feeStatus,
    deliveryRefusal,
    voucher: voucher.status,
    shortfallCentavos,
    unansweredQuestions: unansweredQuestions(questions, answers),
  })

  // What a refusal was about: once the customer changes any of it, the old message no longer applies.
  const sentAnswers = answersToSend(questions, answers)
  const context = stableStringify({
    lines,
    mode,
    outletId: outlet?.id ?? null,
    paymentId: paymentMethod?.id ?? null,
    deliveryPlace,
    paymentReference,
    answers: sentAnswers ?? null,
  })

  const send = (delivery: AppOrderDelivery | null) => {
    // No method offered = the order goes without one (as on the web); a method offered but unpicked never sends.
    if (!orderType || (!paymentMethod && paymentMethods.length > 0)) return
    const draft = buildOrderDraft({
      orderTypeId: orderType.id,
      outletId: outlet?.id ?? null,
      lines,
      paymentMethodId: paymentMethod?.id ?? null,
      paymentReference: needsPaymentReference ? paymentReference : null,
      voucherCode: voucher.codeToSend,
      rewardId: rewardCentavos > 0 && reward ? reward.id : null,
      delivery,
      notes,
      answers: sentAnswers,
    })
    // Same bag as the last unanswered try → same key, so the store returns that order instead of a second one.
    const attempt = attemptFor(useCart.getState().checkoutAttempt, draftFingerprint(draft), mintIdempotencyKey)
    setCheckoutAttempt(attempt)
    placeOrder.mutate(
      { draft, idempotencyKey: attempt.key },
      {
        onSuccess: (order) => {
          router.replace({ pathname: '/order/[id]', params: { id: order.id } })
          clear()
        },
        onError: (error) => {
          const failure = placeOrderFailure(error)
          setShownFailure({ failure, context })
          setCheckoutAttempt(attemptAfterFailure(attempt, failure.code))
        },
      },
    )
  }

  const submit = async () => {
    if (blockers.length > 0 || placeOrder.isPending || isRequoting) return
    setShownFailure(null)
    setNotice(null)
    if (!isDelivery) return send(null)
    if (!deliveryPlace || !quote.data) return
    setIsRequoting(true)
    const result = await freshQuote(quote.data, () => quote.refetch())
    setIsRequoting(false)
    if ('stop' in result) return setNotice(result.stop)
    send({ ...deliveryPlace, quoteToken: result.quote.quoteToken })
  }

  // "Check your orders" stays up whatever changes; a refusal only while it is still about this checkout.
  const failure =
    shownFailure && (shownFailure.failure.kind === 'unconfirmed' || shownFailure.context === context) ? shownFailure.failure : null
  // The store named the questions it refused the order for: show each under its question.
  const questionErrors: Record<string, string> = Object.fromEntries(
    failure?.kind === 'refused' ? failure.fieldErrors.map((error) => [error.fieldName, error.message]) : [],
  )

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
      place: deliveryPlace,
      open: () => router.push('/address-search'),
      pick: (place: PickedPlace) => setDeliveryPlace(place),
      feeStatus,
      refusal: deliveryRefusal,
      summary: isFeeReady && quote.data ? quoteSummary(quote.data, subtotalCentavos) : null,
      retry: () => void quote.refetch(),
    },
    shortfallCentavos,
    questions,
    answers,
    setAnswer,
    questionErrors,
    notes,
    setNotes,
    paymentMethods,
    paymentMethod,
    pickPayment: setPickedPaymentId,
    paymentReference,
    setPaymentReference,
    voucher,
    reward,
    rewardCentavos,
    canUseReward,
    isUsingReward: isRewardOn,
    setIsUsingReward,
    totals,
    isFeeReady,
    blockers,
    submit: () => void submit(),
    isPlacing: placeOrder.isPending || isRequoting,
    failure,
    notice,
  }
}

export type CheckoutModel = ReturnType<typeof useCheckout>
