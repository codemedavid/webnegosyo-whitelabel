import { Check, ChevronRight, Plus } from 'lucide-react-native'
import { View } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import { AppText } from '@/components/ui/app-text'
import { ItemImage } from '@/components/ui/item-image'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppMenuItem } from '@/lib/contract'
import { canQuickAdd } from '@/lib/item/groups'
import { formatPeso, toCentavos } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

const IMAGE_HEIGHT = 84
const BADGE = 32

interface PairingCardProps {
  item: AppMenuItem
  width: number
  isAdded: boolean
  onOpen: () => void
  onQuickAdd: () => void
}

/** A "goes well with" dish: one tap opens it; dishes with nothing to choose get a one-tap "+". */
export function PairingCard({ item, width, isAdded, onOpen, onQuickAdd }: PairingCardProps) {
  const { colors, space } = useTokens()
  const price = formatPeso(toCentavos(item.price))
  const isQuick = canQuickAdd(item)
  const badgeStyle = {
    position: 'absolute' as const,
    top: IMAGE_HEIGHT - BADGE - space.xs,
    right: space.xs,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: colors.surface,
  }
  return (
    <View style={{ width }}>
      <PressableScale onPress={onOpen} accessibilityLabel={`${item.name}, ${price}`} accessibilityHint="Opens the item">
        <ItemImage uri={item.imageUrl} name={item.name} style={{ width, height: IMAGE_HEIGHT }} />
        <AppText variant="callout" numberOfLines={1} style={{ marginTop: space.sm }}>
          {item.name}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {price}
        </AppText>
      </PressableScale>
      {isAdded ? (
        <Animated.View entering={ZoomIn.springify()} style={[badgeStyle, { backgroundColor: colors.success }]}>
          <Check size={16} color={colors.onPrimary} strokeWidth={3} />
        </Animated.View>
      ) : (
        <PressableScale
          haptic={isQuick ? 'light' : 'none'}
          onPress={isQuick ? onQuickAdd : onOpen}
          accessibilityLabel={isQuick ? `Add ${item.name} to your bag` : `Choose options for ${item.name}`}
          style={[badgeStyle, { backgroundColor: colors.primary }]}
        >
          {isQuick ? (
            <Plus size={16} color={colors.onPrimary} strokeWidth={3} />
          ) : (
            <ChevronRight size={16} color={colors.onPrimary} strokeWidth={3} />
          )}
        </PressableScale>
      )}
    </View>
  )
}
