import { View } from 'react-native'
import { useTokens } from '@/theme/theme-context'
import { AppText } from './app-text'
import { PressableScale } from './pressable-scale'

interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onAction?: () => void
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const { space } = useTokens()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        marginBottom: space.md,
      }}
    >
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} accessibilityLabel={`${actionLabel}, ${title}`}>
          <AppText variant="bodyStrong" color="primary">
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  )
}
