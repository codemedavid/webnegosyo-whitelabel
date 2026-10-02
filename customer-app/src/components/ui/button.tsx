import type { ReactNode } from 'react'
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTokens } from '@/theme/theme-context'
import { AppText } from './app-text'
import { PressableScale } from './pressable-scale'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  disabled?: boolean
  isBusy?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  style?: StyleProp<ViewStyle>
  accessibilityHint?: string
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  isBusy,
  leading,
  trailing,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors, radius, space } = useTokens()
  const palette = {
    primary: { background: colors.primary, border: colors.primary, ink: 'onPrimary' as const },
    secondary: { background: colors.surface, border: colors.primary, ink: 'primary' as const },
    ghost: { background: 'transparent', border: 'transparent', ink: 'primary' as const },
  }[variant]
  return (
    <PressableScale
      haptic="light"
      onPress={onPress}
      disabled={disabled || isBusy}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || isBusy, busy: isBusy }}
      style={[
        {
          minHeight: size === 'lg' ? 56 : 46,
          paddingHorizontal: space.xl,
          borderRadius: radius.pill,
          backgroundColor: palette.background,
          borderWidth: 1.5,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {isBusy ? <ActivityIndicator color={colors[palette.ink]} /> : leading}
        <AppText variant={size === 'lg' ? 'headline' : 'bodyStrong'} color={palette.ink}>
          {label}
        </AppText>
        {trailing}
      </View>
    </PressableScale>
  )
}
