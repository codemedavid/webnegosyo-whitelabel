import { MapPin } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StampGrid } from '@/components/ui/stamp-grid'
import type { AppLoyaltyProgram } from '@/lib/contract'
import { loyaltyProgress } from '@/lib/loyalty/progress'
import { useTokens } from '@/theme/theme-context'

/** A punch card has room for this many stamps; bigger programs draw a ring instead. */
const MAX_DRAWN_STAMPS = 20
const RING_SIZE = 148

export function ProgramCard({ program }: { program: AppLoyaltyProgram }) {
  const { colors, space, radius, elevation } = useTokens()
  const progress = loyaltyProgress(program)
  const drawsStamps = program.earnMode === 'stamp' && progress.total <= MAX_DRAWN_STAMPS
  const unit = program.earnMode === 'points' ? 'points' : 'stamps'
  return (
    <View
      accessible
      accessibilityLabel={`${program.name}. ${progress.filled} of ${progress.total} ${unit}. ${progress.caption}`}
      style={{ marginHorizontal: space.lg, padding: space.xl, borderRadius: radius.xl, backgroundColor: colors.surface, ...elevation.card }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <AppText variant="label" color="primary" style={{ flex: 1 }}>
          {program.name.toUpperCase()}
        </AppText>
        {program.branchName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
            <MapPin size={12} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">
              {program.branchName}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.sm }}>
        <AppText variant="display">{progress.filled}</AppText>
        <AppText variant="headline" color="textMuted">
          / {progress.total} {unit}
        </AppText>
      </View>
      <View style={{ alignItems: 'center', marginVertical: space.xl }}>
        {drawsStamps ? (
          <StampGrid
            filled={progress.filled}
            total={progress.total}
            size={46}
            filledColor={colors.primary}
            emptyColor={colors.border}
            inkColor={colors.onPrimary}
          />
        ) : (
          <ProgressRing size={RING_SIZE} strokeWidth={14} progress={progress.fraction} trackColor={colors.primarySoft} color={colors.primary}>
            <AppText variant="display">{progress.remaining}</AppText>
            <AppText variant="caption" color="textMuted">
              to go
            </AppText>
          </ProgressRing>
        )}
      </View>
      <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
        <AppText variant="bodyStrong" color="onPrimarySoft" align="center">
          {progress.caption}
        </AppText>
      </View>
    </View>
  )
}
