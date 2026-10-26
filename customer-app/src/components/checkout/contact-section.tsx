import { UserRound } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { formatPhoneForDisplay } from '@/lib/phone'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'

/** Who the order is for. Orders are tied to a member's number, so guests sign in here. */
export function ContactSection() {
  const { colors, space } = useTokens()
  const session = useSession()
  // The footer button carries the sign-in; this card only says why.
  if (session.status !== 'member' || !session.profile)
    return (
      <CheckoutSection title="Your details">
        <AppText variant="body" color="textMuted">
          Sign in with your number so the store can text you when it’s ready — and you earn stamps on this order.
        </AppText>
      </CheckoutSection>
    )
  const { profile } = session
  return (
    <CheckoutSection title="Your details">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <UserRound size={20} color={colors.onPrimarySoft} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{profile.name ?? 'Member'}</AppText>
          <AppText variant="callout" color="textMuted">
            {formatPhoneForDisplay(profile.phoneE164)}
          </AppText>
        </View>
      </View>
    </CheckoutSection>
  )
}
