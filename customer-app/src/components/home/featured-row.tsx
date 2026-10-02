import { router } from 'expo-router'
import { FlatList, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { ItemImage } from '@/components/ui/item-image'
import { PressableScale } from '@/components/ui/pressable-scale'
import { SectionHeader } from '@/components/ui/section-header'
import type { AppMenuItem } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

const CARD_WIDTH = 156

export function FeaturedRow({ title, items }: { title: string; items: AppMenuItem[] }) {
  const { colors, space, radius } = useTokens()
  if (items.length === 0) return null
  return (
    <View>
      <SectionHeader title={title} actionLabel="See menu" onAction={() => router.push('/order')} />
      <FlatList
        data={items}
        horizontal
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
        renderItem={({ item }) => (
          <PressableScale
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            accessibilityLabel={`${item.name}, ${formatPeso(toCentavos(item.price))}${item.isAvailable ? '' : ', sold out'}`}
            style={{ width: CARD_WIDTH }}
          >
            <ItemImage uri={item.imageUrl} name={item.name} style={{ width: CARD_WIDTH, height: CARD_WIDTH }} />
            {item.badge ? (
              <View
                style={{
                  position: 'absolute',
                  top: space.sm,
                  left: space.sm,
                  paddingHorizontal: space.sm,
                  paddingVertical: 3,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                }}
              >
                <AppText variant="label" color="onAccent">
                  {item.badge.toUpperCase()}
                </AppText>
              </View>
            ) : null}
            <AppText variant="bodyStrong" numberOfLines={2} style={{ marginTop: space.sm }}>
              {item.name}
            </AppText>
            <AppText variant="callout" color={item.isAvailable ? 'textMuted' : 'danger'}>
              {item.isAvailable ? formatPeso(toCentavos(item.price)) : 'Sold out'}
            </AppText>
          </PressableScale>
        )}
      />
    </View>
  )
}
