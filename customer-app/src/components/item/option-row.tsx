import { Check } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppModifierOption } from '@/lib/contract'
import { formatPriceDelta } from '@/lib/item/groups'
import { useTokens } from '@/theme/theme-context'

const MARK = 24

function Mark({ shape, isSelected }: { shape: 'radio' | 'checkbox'; isSelected: boolean }) {
  const { colors, radius } = useTokens()
  return (
    <View
      style={{
        width: MARK,
        height: MARK,
        borderRadius: shape === 'radio' ? MARK / 2 : radius.sm,
        borderWidth: 2,
        borderColor: isSelected ? colors.primary : colors.border,
        backgroundColor: isSelected && shape === 'checkbox' ? colors.primary : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isSelected && shape === 'radio' ? (
        <View style={{ width: MARK / 2, height: MARK / 2, borderRadius: MARK / 4, backgroundColor: colors.primary }} />
      ) : null}
      {isSelected && shape === 'checkbox' ? <Check size={15} color={colors.onPrimary} strokeWidth={3.2} /> : null}
    </View>
  )
}

interface OptionRowProps {
  option: AppModifierOption
  isSelected: boolean
  shape: 'radio' | 'checkbox'
  /** True when the group is full and this option is not picked — the tap would do nothing. */
  isBlocked?: boolean
  onPress: () => void
}

/** A radio or checkbox row: name on the left, "+₱20" on the right, unavailable options greyed. */
export function OptionRow({ option, isSelected, shape, isBlocked, onPress }: OptionRowProps) {
  const { space } = useTokens()
  const delta = formatPriceDelta(option.priceDelta)
  const isDimmed = !option.isAvailable || (isBlocked && !isSelected)
  return (
    <PressableScale
      scaleTo={0.99}
      haptic="selection"
      onPress={onPress}
      disabled={!option.isAvailable}
      accessibilityRole={shape === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: isSelected, disabled: !option.isAvailable }}
      accessibilityLabel={`${option.name}${delta ? `, ${delta}` : ''}${option.isAvailable ? '' : ', unavailable'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, opacity: isDimmed ? 0.5 : 1 }}
    >
      <Mark shape={shape} isSelected={isSelected} />
      <OptionText name={option.name} isAvailable={option.isAvailable} />
      {delta ? (
        <AppText variant="callout" color="textMuted">
          {delta}
        </AppText>
      ) : null}
    </PressableScale>
  )
}

export function OptionText({ name, isAvailable, children }: { name: string; isAvailable: boolean; children?: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="body" numberOfLines={2}>
        {name}
      </AppText>
      {!isAvailable ? (
        <AppText variant="caption" color="textMuted">
          Unavailable today
        </AppText>
      ) : null}
      {children}
    </View>
  )
}
