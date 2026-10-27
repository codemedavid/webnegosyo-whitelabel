import { Minus, Plus } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { useTokens } from '@/theme/theme-context'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Read out with the buttons: "Decrease Extra espresso shot". */
  label: string
  size?: 'sm' | 'md'
}

/** − n + with haptics; the ends dim instead of disappearing so the control never jumps. Each button is its own labelled target. */
export function QuantityStepper({ value, onChange, min = 0, max = Number.POSITIVE_INFINITY, label, size = 'md' }: QuantityStepperProps) {
  const { colors, space, radius } = useTokens()
  const button = size === 'sm' ? 32 : 40
  const icon = size === 'sm' ? 16 : 18
  const canDecrease = value > min
  const canIncrease = value < max
  const buttonStyle = (isEnabled: boolean) => ({
    width: button,
    height: button,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1.5,
    borderColor: isEnabled ? colors.primary : colors.border,
    backgroundColor: colors.surface,
  })
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <PressableScale
        haptic="selection"
        disabled={!canDecrease}
        onPress={() => onChange(value - 1)}
        accessibilityLabel={`Decrease ${label}`}
        style={buttonStyle(canDecrease)}
      >
        <Minus size={icon} color={canDecrease ? colors.primary : colors.textMuted} strokeWidth={2.6} />
      </PressableScale>
      <AppText
        variant={size === 'sm' ? 'bodyStrong' : 'headline'}
        accessibilityLabel={`${label}: ${value}`}
        accessibilityLiveRegion="polite"
        // Grows with dynamic type instead of clipping a two-digit count beside the fixed buttons.
        style={{ minWidth: button * 0.7, flexShrink: 0, textAlign: 'center' }}
      >
        {value}
      </AppText>
      <PressableScale
        haptic="selection"
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
        accessibilityLabel={`Increase ${label}`}
        style={buttonStyle(canIncrease)}
      >
        <Plus size={icon} color={canIncrease ? colors.primary : colors.textMuted} strokeWidth={2.6} />
      </PressableScale>
    </View>
  )
}
