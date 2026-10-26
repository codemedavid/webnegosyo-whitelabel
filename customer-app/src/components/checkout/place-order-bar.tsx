import { router } from 'expo-router'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/money'
import { useTokens } from '@/theme/theme-context'

interface PlaceOrderBarProps {
  totalCentavos: number
  /** First reason the order can't go yet; null when it can. */
  blocker: string | null
  error: string | null
  isPlacing: boolean
  onPlace: () => void
  /** Guests get a sign-in button instead; orders belong to a member's number. */
  isGuest: boolean
}

/** Sticky footer: says what's missing, or places the order. */
export function PlaceOrderBar({ totalCentavos, blocker, error, isPlacing, onPlace, isGuest }: PlaceOrderBarProps) {
  const { colors, space, elevation } = useTokens()
  const insets = useSafeAreaInsets()
  const message = error ?? (isGuest ? null : blocker)
  return (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: Math.max(insets.bottom, space.md),
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: space.sm,
        ...elevation.raised,
      }}
    >
      {message ? (
        <AppText variant="callout" color={error ? 'danger' : 'textMuted'} align="center" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}
      {isGuest ? (
        <Button size="lg" label="Sign in to place your order" onPress={() => router.push('/sign-in')} />
      ) : (
        <Button
          size="lg"
          label={`Place order · ${formatPeso(totalCentavos)}`}
          onPress={onPlace}
          disabled={blocker !== null}
          isBusy={isPlacing}
          accessibilityHint={blocker ?? undefined}
        />
      )}
    </View>
  )
}
