import { router } from 'expo-router'
import { ChevronRight, QrCode } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { PressableScale } from '@/components/ui/pressable-scale'
import { ProgressRing } from '@/components/ui/progress-ring'
import { Skeleton } from '@/components/ui/skeleton'
import { useLoyalty } from '@/lib/data/hooks'
import { loyaltyProgress } from '@/lib/loyalty/progress'
import { useTokens } from '@/theme/theme-context'
import { HEADER_OVERLAP } from './home-header'

interface MemberCardProps {
  isMember: boolean
  joinTitle: string
  joinBody: string
}

function Card({ children }: { children: React.ReactNode }) {
  const { colors, radius, space, elevation } = useTokens()
  return (
    <View
      style={{
        marginTop: -HEADER_OVERLAP,
        marginHorizontal: space.lg,
        padding: space.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        ...elevation.raised,
      }}
    >
      {children}
    </View>
  )
}

function GuestCard({ title, body }: { title: string; body: string }) {
  const { space } = useTokens()
  return (
    <Card>
      <AppText variant="headline">{title}</AppText>
      <AppText variant="callout" color="textMuted" style={{ marginTop: space.xs, marginBottom: space.lg }}>
        {body}
      </AppText>
      <Button label="Join or sign in" onPress={() => router.push('/sign-in')} />
    </Card>
  )
}

function MemberProgress() {
  const { colors, space } = useTokens()
  const { data, isPending } = useLoyalty()
  const program = data?.programs[0]
  if (isPending)
    return (
      <Card>
        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <Skeleton width={84} height={84} radius={42} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Skeleton height={18} width="70%" />
            <Skeleton height={14} width="90%" />
          </View>
        </View>
      </Card>
    )
  if (!program) return null
  const progress = loyaltyProgress(program)
  const rewardsReady = data?.rewards.length ?? 0
  return (
    <Card>
      <PressableScale
        onPress={() => router.push('/rewards')}
        accessibilityLabel={`${program.name}. ${progress.filled} of ${progress.total}. ${progress.caption}`}
        style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}
      >
        <ProgressRing size={84} strokeWidth={9} progress={progress.fraction} trackColor={colors.primarySoft} color={colors.primary}>
          <AppText variant="title">{progress.filled}</AppText>
          <AppText variant="caption" color="textMuted">
            of {progress.total}
          </AppText>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color="primary">
            {program.name.toUpperCase()}
          </AppText>
          <AppText variant="headline" style={{ marginTop: space.xxs }}>
            {progress.caption}
          </AppText>
          {rewardsReady > 0 ? (
            <AppText variant="caption" color="success" style={{ marginTop: space.xs }}>
              {rewardsReady} reward{rewardsReady === 1 ? '' : 's'} ready to use
            </AppText>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </PressableScale>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />
      <PressableScale
        onPress={() => router.push('/scan')}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 36 }}
      >
        <QrCode size={18} color={colors.primary} />
        <AppText variant="bodyStrong" color="primary">
          Scan to earn at the counter
        </AppText>
      </PressableScale>
    </Card>
  )
}

/** Stamp progress for members; a join prompt for guests. Always overlaps the header. */
export function MemberCard({ isMember, joinTitle, joinBody }: MemberCardProps) {
  return isMember ? <MemberProgress /> : <GuestCard title={joinTitle} body={joinBody} />
}
