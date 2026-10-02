import { router } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { memo } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { ItemImage } from '@/components/ui/item-image'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppMenuItem } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

const IMAGE_SIZE = 104

function MenuItemRowBase({ item }: { item: AppMenuItem }) {
  const { colors, space, radius } = useTokens()
  const price = formatPeso(toCentavos(item.price))
  return (
    <PressableScale
      scaleTo={0.985}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityLabel={`${item.name}, ${price}${item.isAvailable ? '' : ', sold out'}`}
      accessibilityHint="Opens the item to customise and add to your bag"
      style={{ flexDirection: 'row', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.md }}
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {item.badge ? (
          <AppText variant="label" color="primary" style={{ marginBottom: space.xxs }}>
            {item.badge.toUpperCase()}
          </AppText>
        ) : null}
        <AppText variant="headline" numberOfLines={2}>
          {item.name}
        </AppText>
        {item.description ? (
          <AppText variant="callout" color="textMuted" numberOfLines={2} style={{ marginTop: space.xxs }}>
            {item.description}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
          {item.isAvailable ? (
            <AppText variant="price">{price}</AppText>
          ) : (
            <AppText variant="bodyStrong" color="danger">
              Sold out
            </AppText>
          )}
          {item.compareAtPrice && item.isAvailable ? (
            <AppText variant="callout" color="textMuted" style={{ textDecorationLine: 'line-through' }}>
              {formatPeso(toCentavos(item.compareAtPrice))}
            </AppText>
          ) : null}
        </View>
      </View>
      <View>
        <ItemImage
          uri={item.imageUrl}
          name={item.name}
          style={{ width: IMAGE_SIZE, height: IMAGE_SIZE, opacity: item.isAvailable ? 1 : 0.5 }}
        />
        {item.isAvailable ? (
          <View
            style={{
              position: 'absolute',
              right: -6,
              bottom: -6,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: colors.primary,
              borderWidth: 3,
              borderColor: colors.background,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} color={colors.onPrimary} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: 0, height: 1, backgroundColor: colors.border, borderRadius: radius.sm }} />
    </PressableScale>
  )
}

export const MenuItemRow = memo(MenuItemRowBase)
