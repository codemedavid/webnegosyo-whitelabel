import type { ReactNode } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { useTokens } from '@/theme/theme-context'

interface CheckoutSectionProps {
  title: string
  actionLabel?: string
  onAction?: () => void
  children: ReactNode
}

/** One white card on the review screen: a small caps title, an optional action, the content. */
export function CheckoutSection({ title, actionLabel, onAction, children }: CheckoutSectionProps) {
  const { colors, space, radius, elevation } = useTokens()
  return (
    <View style={{ marginHorizontal: space.lg, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, ...elevation.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
        <AppText variant="label" color="textMuted" accessibilityRole="header">
          {title.toUpperCase()}
        </AppText>
        {actionLabel && onAction ? (
          <PressableScale onPress={onAction} accessibilityLabel={`${actionLabel} ${title}`}>
            <AppText variant="bodyStrong" color="primary">
              {actionLabel}
            </AppText>
          </PressableScale>
        ) : null}
      </View>
      {children}
    </View>
  )
}
