import { router } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { memo } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppOrderSummary } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'
import { formatOrderDate } from '@/lib/orders/format'
import { statusPill } from '@/lib/orders/status'
import { useTokens } from '@/theme/theme-context'
import { StatusPill } from './status-pill'

function OrderCardBase({ order, now }: { order: AppOrderSummary; now: Date }) {
  const { colors, space, radius, elevation } = useTokens()
  const when = formatOrderDate(order.placedAt, now)
  const total = formatPeso(toCentavos(order.total))
  const title = order.number ? `Order #${order.number}` : order.orderTypeName
  return (
    <PressableScale
      scaleTo={0.985}
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
      accessibilityLabel={`${title}, ${statusPill(order.status, order.orderKind).label}, ${when}, ${total}`}
      style={{ marginHorizontal: space.lg, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, gap: space.sm, ...elevation.card }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <AppText variant="headline">{title}</AppText>
          <AppText variant="caption" color="textMuted">
            {when} · {order.orderTypeName}
            {order.outletName ? ` · ${order.outletName}` : ''}
          </AppText>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
      <AppText variant="callout" color="textMuted" numberOfLines={2}>
        {order.itemsPreview.join(', ')}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusPill status={order.status} kind={order.orderKind} />
        <AppText variant="price">{total}</AppText>
      </View>
    </PressableScale>
  )
}

export const OrderCard = memo(OrderCardBase)
