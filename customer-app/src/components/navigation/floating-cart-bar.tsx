import { router } from 'expo-router'
import { ShoppingBag } from 'lucide-react-native'
import { View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { formatPeso } from '@/lib/money'
import { useCartSummary } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

/** "Review order" bar that rides above the tab bar whenever the bag has something in it. */
export function FloatingCartBar() {
  const { colors, space, radius, elevation } = useTokens()
  const { itemCount, subtotalCentavos } = useCartSummary()
  if (itemCount === 0) return null
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
      <PressableScale
        haptic="light"
        onPress={() => router.push('/checkout')}
        accessibilityLabel={`Review order, ${itemCount} items, ${formatPeso(subtotalCentavos)}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 56,
          paddingHorizontal: space.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.primary,
          ...elevation.raised,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 }}>
          <View>
            <ShoppingBag size={22} color={colors.onPrimary} />
            <View
              style={{
                position: 'absolute',
                top: -6,
                right: -10,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 4,
                borderRadius: 9,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="label" color="onAccent" style={{ letterSpacing: 0 }}>
                {itemCount}
              </AppText>
            </View>
          </View>
          <AppText variant="bodyStrong" color="onPrimary" style={{ marginLeft: space.md }}>
            Review order
          </AppText>
        </View>
        <AppText variant="price" color="onPrimary">
          {formatPeso(subtotalCentavos)}
        </AppText>
      </PressableScale>
    </Animated.View>
  )
}
