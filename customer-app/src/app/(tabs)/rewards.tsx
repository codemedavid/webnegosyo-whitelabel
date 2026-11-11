import { Gift } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ActivityList } from '@/components/rewards/activity-list'
import { ClaimSheet } from '@/components/rewards/claim-sheet'
import { HowItWorks } from '@/components/rewards/how-it-works'
import { JoinHero } from '@/components/rewards/join-hero'
import { ProgramCard } from '@/components/rewards/program-card'
import { RewardCard } from '@/components/rewards/reward-card'
import { RewardsSkeleton } from '@/components/rewards/rewards-skeleton'
import { AppText } from '@/components/ui/app-text'
import type { AppReward } from '@/lib/contract'
import { useAppConfig, useLoyalty } from '@/lib/data/hooks'
import { useRefreshLoyaltyOnFocus } from '@/lib/data/use-refresh-loyalty-on-focus'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

function SectionTitle({ children }: { children: string }) {
  const { space } = useTokens()
  return (
    <AppText variant="title" accessibilityRole="header" style={{ marginHorizontal: space.lg, marginBottom: -space.sm }}>
      {children}
    </AppText>
  )
}

function MemberRewards() {
  const { space } = useTokens()
  const { data: loyalty, isPending, isError, refetch } = useLoyalty()
  // Kept here, not on the card: the card leaves the list the moment the counter scans it.
  const [claimFor, setClaimFor] = useState<AppReward | null>(null)
  const closeClaim = useCallback(() => setClaimFor(null), [])
  const now = new Date()
  if (isPending) return <RewardsSkeleton />
  if (isError || !loyalty)
    return (
      <AppText variant="body" color="textMuted" style={{ marginHorizontal: space.lg }} onPress={() => void refetch()}>
        We couldn’t load your rewards. Pull down to try again.
      </AppText>
    )
  const program = loyalty.programs[0]
  return (
    <View style={{ gap: space.xl }}>
      {loyalty.programs.map((candidate) => (
        <ProgramCard key={candidate.id} program={candidate} />
      ))}
      {loyalty.rewards.length > 0 ? (
        <>
          <SectionTitle>Ready to use</SectionTitle>
          {loyalty.rewards.map((reward) => (
            <RewardCard key={reward.id} reward={reward} now={now} canClaim={loyalty.claimsAvailable} onUse={setClaimFor} />
          ))}
        </>
      ) : null}
      <SectionTitle>Activity</SectionTitle>
      <ActivityList activity={loyalty.activity} earnMode={program?.earnMode ?? 'stamp'} now={now} />
      {program ? (
        <>
          <SectionTitle>How it works</SectionTitle>
          <HowItWorks program={program} />
        </>
      ) : null}
      {claimFor ? <ClaimSheet reward={claimFor} onClose={closeClaim} /> : null}
    </View>
  )
}

export default function RewardsScreen() {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const { data: config } = useAppConfig()
  const isMember = useSession((state) => state.status === 'member')
  const { refetch, isRefetching } = useLoyalty()
  useRefreshLoyaltyOnFocus()
  if (!config) return null

  const body = !config.features.loyalty ? (
    <View style={{ marginHorizontal: space.lg, alignItems: 'center', gap: space.md, marginTop: space.xxl }}>
      <Gift size={36} color={colors.textMuted} />
      <AppText variant="headline" align="center">
        No rewards program yet
      </AppText>
      <AppText variant="callout" color="textMuted" align="center">
        {config.tenant.name} hasn’t started one. Check back soon.
      </AppText>
    </View>
  ) : isMember ? (
    <MemberRewards />
  ) : (
    <JoinHero title={config.copy.guestJoinTitle} body={config.copy.guestJoinBody} />
  )

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl * 2 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        isMember ? <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} /> : undefined
      }
    >
      <AppText variant="display" accessibilityRole="header" style={{ paddingHorizontal: space.lg, marginBottom: space.lg }}>
        Rewards
      </AppText>
      {body}
    </ScrollView>
  )
}
