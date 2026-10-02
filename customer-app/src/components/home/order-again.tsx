import { router } from 'expo-router'
import { RotateCcw } from 'lucide-react-native'
import { FlatList, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrders } from '@/lib/data/hooks'
import { formatPeso, toCentavos } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

const CARD_WIDTH = 240

export function OrderAgain({ title }: { title: string }) {
  const { colors, space, radius, elevation } = useTokens()
  const { data: orders, isPending } = useOrders()
  if (isPending)
    return (
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <Skeleton height={24} width={140} />
        <Skeleton height={96} width={CARD_WIDTH} />
      </View>
    )
  if (!orders || orders.length === 0) return null
  return (
    <View>
      <SectionHeader title={title} actionLabel="History" onAction={() => router.push('/orders')} />
      <FlatList
        data={orders}
        horizontal
        keyExtractor={(order) => order.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
        renderItem={({ item: order }) => (
          <PressableScale
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            style={{
              width: CARD_WIDTH,
              padding: space.lg,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              ...elevation.card,
            }}
          >
            <AppText variant="bodyStrong" numberOfLines={2}>
              {order.itemsPreview.join(', ')}
            </AppText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.md }}>
              <AppText variant="callout" color="textMuted">
                {formatPeso(toCentavos(order.total))}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <RotateCcw size={14} color={colors.primary} />
                <AppText variant="bodyStrong" color="primary">
                  Reorder
                </AppText>
              </View>
            </View>
          </PressableScale>
        )}
      />
    </View>
  )
}
