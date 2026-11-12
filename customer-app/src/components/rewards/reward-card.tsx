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

interface RewardCardProps {
  reward: AppReward
  now: Date
  /** The store's counter can scan a claim QR; otherwise the cashier applies it by hand. */
  canClaim: boolean
  onUse: (reward: AppReward) => void
}

export function RewardCard({ reward, now, canClaim, onUse }: RewardCardProps) {
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
        {canClaim ? null : (
          <AppText variant="caption" color="primary" style={{ marginTop: space.xxs }}>
            Ask the cashier to apply this reward
          </AppText>
        )}
      </View>
      {canClaim ? (
        <PressableScale
          haptic="light"
          onPress={() => onUse(reward)}
          accessibilityLabel={`Use ${reward.label} now`}
          accessibilityHint="Shows a code for the cashier to scan"
          style={{ paddingHorizontal: space.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary }}
        >
          <AppText variant="caption" color="onPrimary" style={{ fontSize: 13 }}>
            Use now
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  )
}
