import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import type { AppLoyaltyActivity, AppLoyaltyProgram } from '@/lib/contract'
import { activityTone, formatActivityDate, formatDelta } from '@/lib/rewards/activity'
import { useTokens } from '@/theme/theme-context'

interface ActivityListProps {
  activity: AppLoyaltyActivity[]
  earnMode: AppLoyaltyProgram['earnMode']
  now: Date
}

export function ActivityList({ activity, earnMode, now }: ActivityListProps) {
  const { colors, space, radius } = useTokens()
  if (activity.length === 0)
    return (
      <AppText variant="callout" color="textMuted" style={{ marginHorizontal: space.lg }}>
        Your stamps and rewards will show up here after your first order.
      </AppText>
    )
  return (
    <View style={{ marginHorizontal: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' }}>
      {activity.map((entry, index) => {
        const delta = formatDelta(entry.delta, earnMode)
        const date = formatActivityDate(entry.occurredAt, now)
        return (
          <View
            key={entry.id}
            accessible
            accessibilityLabel={`${entry.label}, ${date}, ${delta}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              minHeight: 56,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {entry.label}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {date}
              </AppText>
            </View>
            <AppText variant="bodyStrong" color={activityTone(entry.kind)}>
              {delta}
            </AppText>
          </View>
        )
      })}
    </View>
  )
}
