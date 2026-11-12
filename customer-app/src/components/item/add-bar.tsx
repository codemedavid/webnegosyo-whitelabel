import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

interface AddBarProps {
  totalCentavos: number
  isSoldOut: boolean
  onAdd: () => void
}

/** Sticky "Add to bag · ₱xxx" — the price always reflects the picks × quantity. */
export function AddBar({ totalCentavos, isSoldOut, onAdd }: AddBarProps) {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const label = isSoldOut ? 'Sold out' : `Add to bag · ${formatPeso(totalCentavos)}`
  return (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: Math.max(insets.bottom, space.lg),
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Button label={label} size="lg" disabled={isSoldOut} onPress={onAdd} accessibilityHint="Adds this item to your bag" />
    </View>
  )
}
