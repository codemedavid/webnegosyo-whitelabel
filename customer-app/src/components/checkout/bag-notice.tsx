import { Info, X } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { useCart } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'

/** A one-off note at the top of the bag (e.g. dishes "Order again" left out); dismissible. */
export function BagNotice() {
  const { colors, space, radius } = useTokens()
  const notice = useCart((state) => state.bagNotice)
  const setBagNotice = useCart((state) => state.setBagNotice)
  if (!notice) return null
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingLeft: space.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Info size={18} color={colors.warning} />
      <AppText variant="callout" style={{ flex: 1, paddingVertical: space.md }}>
        {notice}
      </AppText>
      <PressableScale
        onPress={() => setBagNotice(null)}
        accessibilityLabel="Dismiss note"
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={18} color={colors.textMuted} />
      </PressableScale>
    </View>
  )
}
