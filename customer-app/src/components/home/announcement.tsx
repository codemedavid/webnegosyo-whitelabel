import { Info, Megaphone, TriangleAlert } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { useTokens } from '@/theme/theme-context'

export function Announcement({ text, tone }: { text: string; tone: 'info' | 'promo' | 'warning' }) {
  const { colors, space, radius } = useTokens()
  const palette = {
    info: { background: colors.surfaceMuted, ink: colors.text, Icon: Info },
    promo: { background: colors.primarySoft, ink: colors.onPrimarySoft, Icon: Megaphone },
    warning: { background: '#FFF4E0', ink: '#6B4500', Icon: TriangleAlert },
  }[tone]
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: space.lg,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: palette.background,
        flexDirection: 'row',
        gap: space.sm,
        alignItems: 'center',
      }}
    >
      <palette.Icon size={18} color={palette.ink} />
      <AppText variant="callout" style={{ color: palette.ink, flex: 1 }}>
        {text}
      </AppText>
    </View>
  )
}
