import { useLocalSearchParams } from 'expo-router'
import { RefreshControl, ScrollView, View } from 'react-native'
import { CheckoutSection } from '@/components/checkout/checkout-section'
import { OrderAgainButton } from '@/components/orders/order-again-button'
import { OrderHero } from '@/components/orders/order-hero'
import { OrderLines } from '@/components/orders/order-lines'
import { TotalsRows } from '@/components/orders/totals-rows'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StepTracker } from '@/components/ui/step-tracker'
import { useOrder } from '@/lib/data/hooks'
import { toCentavos } from '@/lib/money'
import { paymentLine } from '@/lib/orders/payment-line'
import { isTerminalStatus } from '@/lib/orders/status'
import { trackingSteps } from '@/lib/orders/steps'
import { useTokens } from '@/theme/theme-context'

function TrackingSkeleton() {
  const { space } = useTokens()
  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <Skeleton height={190} />
      <Skeleton height={240} />
      <Skeleton height={160} />
    </View>
  )
}

const PAYMENT_TONE = { success: 'success', muted: 'textMuted', danger: 'danger' } as const

/** Live tracker: refreshes itself until the order is completed or cancelled. */
export default function OrderTrackingScreen() {
  const { colors, space, radius } = useTokens()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: order, isPending, isError, refetch, isRefetching } = useOrder(id)

  if (isPending) return <TrackingSkeleton />
  // A failed background refresh keeps the tracker on screen; only a first load with no order is an error.
  if (!order)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.lg }}>
        <AppText variant="title" align="center">
          We couldn’t load this order
        </AppText>
        <Button label="Try again" onPress={() => void refetch()} />
      </View>
    )

  const payment = paymentLine(order)
  const { totals } = order
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: space.xxxl }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    >
      {isError ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ marginHorizontal: space.lg, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}
        >
          <AppText variant="callout" color="textMuted" align="center">
            Reconnecting… showing the latest status we have.
          </AppText>
        </View>
      ) : null}
      <OrderHero order={order} />
      <CheckoutSection title="Progress">
        <StepTracker steps={trackingSteps(order.status, order.orderKind)} />
      </CheckoutSection>
      <CheckoutSection title="Your order">
        <OrderLines lines={order.lines} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
        <TotalsRows
          subtotalCentavos={toCentavos(totals.subtotal)}
          discountCentavos={toCentavos(totals.discount)}
          deliveryFeeCentavos={toCentavos(totals.deliveryFee)}
          serviceChargeCentavos={toCentavos(totals.serviceCharge)}
          totalCentavos={toCentavos(totals.total)}
          showDelivery={order.orderKind === 'delivery'}
        />
        <AppText variant="callout" color={PAYMENT_TONE[payment.tone]} style={{ marginTop: space.md }}>
          {payment.text}
        </AppText>
      </CheckoutSection>
      {isTerminalStatus(order.status) ? <OrderAgainButton order={order} /> : null}
    </ScrollView>
  )
}
