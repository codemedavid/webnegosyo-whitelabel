import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import type { AppOrderDetail } from '@/lib/contract'
import { formatTime } from '@/lib/orders/format'
import { isTerminalStatus } from '@/lib/orders/status'
import { statusLabel } from '@/lib/orders/steps'
import { useTokens } from '@/theme/theme-context'

/** The brand-coloured top of the tracker: the number the counter calls, what's happening, when. */
export function OrderHero({ order }: { order: AppOrderDetail }) {
  const { colors, space, radius, type } = useTokens()
  const isLive = !isTerminalStatus(order.status)
  const eta = isLive && order.estimatedReadyAt ? `${order.orderKind === 'delivery' ? 'Arriving' : 'Ready'} around ${formatTime(order.estimatedReadyAt)}` : null
  return (
    <View style={{ marginHorizontal: space.lg, padding: space.xl, borderRadius: radius.xl, backgroundColor: colors.primary, alignItems: 'center' }}>
      {order.number ? (
        <>
          <AppText variant="label" color="onPrimary" style={{ opacity: 0.85 }}>
            ORDER NUMBER
          </AppText>
          <AppText color="onPrimary" style={[type.display, { fontSize: 56, lineHeight: 64 }]} accessibilityLabel={`Order number ${order.number}`}>
            #{order.number}
          </AppText>
        </>
      ) : null}
      <AppText variant="title" color="onPrimary" align="center" accessibilityLiveRegion="polite">
        {statusLabel(order.status, order.orderKind)}
      </AppText>
      {eta ? (
        <AppText variant="callout" color="onPrimary" style={{ marginTop: space.xs, opacity: 0.9 }}>
          {eta}
        </AppText>
      ) : null}
      {order.outletName ? (
        <AppText variant="caption" color="onPrimary" style={{ marginTop: space.sm, opacity: 0.85 }}>
          {order.orderTypeName} · {order.outletName}
        </AppText>
      ) : null}
    </View>
  )
}
