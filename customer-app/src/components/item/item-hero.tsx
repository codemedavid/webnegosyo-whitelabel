import { router } from 'expo-router'
import { X } from 'lucide-react-native'
import { Platform, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ItemImage } from '@/components/ui/item-image'
import { PressableScale } from '@/components/ui/pressable-scale'
import { useTokens } from '@/theme/theme-context'

const HERO_ASPECT = 0.86
const CLOSE_SIZE = 40

/** Full-bleed dish photo with a floating close button (the modal's only chrome). */
export function ItemHero({ uri, name, isSoldOut }: { uri: string | null; name: string; isSoldOut: boolean }) {
  const { colors, space, elevation } = useTokens()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // iOS presents the modal as a card below the status bar; Android draws it full screen.
  const top = Platform.OS === 'ios' ? space.lg : insets.top + space.sm
  return (
    <View>
      <ItemImage uri={uri} name={name} radius={0} style={{ width, height: width * HERO_ASPECT, opacity: isSoldOut ? 0.6 : 1 }} />
      <PressableScale
        onPress={() => router.back()}
        accessibilityLabel="Close"
        style={{
          position: 'absolute',
          top,
          left: space.lg,
          width: CLOSE_SIZE,
          height: CLOSE_SIZE,
          borderRadius: CLOSE_SIZE / 2,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          ...elevation.card,
        }}
      >
        <X size={20} color={colors.text} strokeWidth={2.4} />
      </PressableScale>
    </View>
  )
}
