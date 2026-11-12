import { BellRing } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { dismissNotificationAsk, loadPushState, turnOnNotifications, usePush } from '@/lib/push/push-actions'
import { shouldShowAsk } from '@/lib/push/push-state'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

/**
 * "Get a ping when it's ready" — the reason comes before the phone's own
 * prompt, which can be shown only once. Asked on an open order's screen,
 * never at launch (owner, 2026-11-12).
 */
export function NotificationAsk() {
  const { colors, space, radius } = useTokens()
  const push = usePush()
  const isMember = useSession((state) => state.status === 'member')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    void loadPushState()
  }, [])

  if (!push.isLoaded || !shouldShowAsk(push, isMember)) return null

  const turnOn = async () => {
    setIsBusy(true)
    try {
      await turnOnNotifications()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <View
      accessibilityRole="summary"
      style={{ marginHorizontal: space.lg, padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <BellRing size={22} color={colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">Get a ping when it’s ready</AppText>
          <AppText variant="callout" color="textMuted">
            We’ll only notify you about your orders: accepted, ready or cancelled.
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Turn on" onPress={() => void turnOn()} isBusy={isBusy} style={{ flex: 1 }} />
        <Button label="Not now" variant="ghost" onPress={() => void dismissNotificationAsk()} disabled={isBusy} style={{ flex: 1 }} />
      </View>
    </View>
  )
}
