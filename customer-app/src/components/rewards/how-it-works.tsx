import { CircleCheck } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import type { AppLoyaltyProgram } from '@/lib/contract'
import { howItWorks } from '@/lib/rewards/activity'
import { useTokens } from '@/theme/theme-context'

export function HowItWorks({ program }: { program: AppLoyaltyProgram }) {
  const { colors, space, radius } = useTokens()
  return (
    <View style={{ marginHorizontal: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, gap: space.md }}>
      {howItWorks(program).map((line) => (
        <View key={line} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <CircleCheck size={18} color={colors.primary} style={{ marginTop: 2 }} />
          <AppText variant="callout" style={{ flex: 1 }}>
            {line}
          </AppText>
        </View>
      ))}
    </View>
  )
}
