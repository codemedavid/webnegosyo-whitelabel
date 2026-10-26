import { router } from 'expo-router'
import { Gift } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppReward } from '@/lib/contract'
import { formatExpiry } from '@/lib/rewards/activity'
import { useTokens } from '@/theme/theme-context'

/** Expiry turns amber this close to the end. */
const URGENT_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export function RewardCard({ reward, now }: { reward: AppReward; now: Date }) {
  const { colors, space, radius, elevation } = useTokens()
  const expiry = formatExpiry(reward.expiresAt, now)
  const isUrgent = reward.expiresAt !== null && new Date(reward.expiresAt).getTime() - now.getTime() < URGENT_DAYS * DAY_MS
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        marginHorizontal: space.lg,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.accent,
        ...elevation.card,
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Gift size={24} color={colors.onAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="headline" numberOfLines={2}>
          {reward.label}
        </AppText>
        <AppText variant="caption" color={isUrgent ? 'warning' : 'textMuted'} style={{ marginTop: space.xxs }}>
          {[reward.branchName, expiry].filter(Boolean).join(' · ') || reward.programName}
        </AppText>
      </View>
      <PressableScale
        haptic="light"
        onPress={() => router.push('/scan')}
        accessibilityLabel={`Use ${reward.label} at the counter`}
        accessibilityHint="Opens your member QR code"
        style={{ paddingHorizontal: space.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary }}
      >
        <AppText variant="caption" color="onPrimary" style={{ fontSize: 13 }}>
          Show at counter
        </AppText>
      </PressableScale>
    </View>
  )
}
