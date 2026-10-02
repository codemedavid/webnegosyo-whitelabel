import { Text, type TextProps } from 'react-native'
import type { AppColors } from '@/lib/contract'
import type { Tokens } from '@/lib/theme/tokens'
import { useTokens } from '@/theme/theme-context'

export type TextVariant = keyof Tokens['type']

interface AppTextProps extends TextProps {
  variant?: TextVariant
  color?: keyof AppColors
  align?: 'left' | 'center' | 'right'
}

/** The only text component screens use: every string rides the tenant's type scale. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const tokens = useTokens()
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[tokens.type[variant], { color: tokens.colors[color], textAlign: align }, style]}
    />
  )
}
