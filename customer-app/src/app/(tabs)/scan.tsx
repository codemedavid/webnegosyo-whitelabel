import { QrCode, ScanLine } from 'lucide-react-native'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SignInPrompt } from '@/components/auth/sign-in-prompt'
import { MemberQrCard } from '@/components/rewards/member-qr-card'
import { useMaxBrightness } from '@/components/rewards/use-max-brightness'
import { AppText } from '@/components/ui/app-text'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppConfig, useLoyalty } from '@/lib/data/hooks'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

function MemberScan({ storeName }: { storeName: string }) {
  const { colors, space, radius } = useTokens()
  const profile = useSession((state) => state.profile)
  const { data: loyalty, isPending } = useLoyalty()
  const memberCode = loyalty?.memberCode ?? null
  useMaxBrightness(memberCode !== null)

  if (isPending)
    return (
      <View style={{ marginHorizontal: space.lg }}>
        <Skeleton height={440} radius={radius.xl} />
      </View>
    )
  if (!profile || !memberCode)
    return (
      <View style={{ marginHorizontal: space.lg, alignItems: 'center', gap: space.md, marginTop: space.xxl }}>
        <QrCode size={36} color={colors.textMuted} />
        <AppText variant="headline" align="center">
          Your member card is on its way
        </AppText>
        <AppText variant="callout" color="textMuted" align="center">
          It appears here after your first order. Pull Rewards to refresh.
        </AppText>
      </View>
    )
  return (
    <View style={{ gap: space.xl }}>
      <MemberQrCard memberCode={memberCode} storeName={storeName} memberName={profile.name} phoneE164={profile.phoneE164} />
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', marginHorizontal: space.xl }}>
        <ScanLine size={22} color={colors.primary} />
        <AppText variant="callout" color="textMuted" style={{ flex: 1 }}>
          Show this at the counter to earn stamps and redeem rewards.
        </AppText>
      </View>
    </View>
  )
}

export default function ScanScreen() {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const { data: config } = useAppConfig()
  const isMember = useSession((state) => state.status === 'member')
  if (!config) return null
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl * 2 }}
      showsVerticalScrollIndicator={false}
    >
      <AppText variant="display" accessibilityRole="header" style={{ paddingHorizontal: space.lg, marginBottom: space.lg }}>
        Scan
      </AppText>
      {isMember ? (
        <MemberScan storeName={config.tenant.name} />
      ) : (
        <SignInPrompt
          Icon={QrCode}
          title="Your member card"
          body="Sign in with your mobile number to get a QR code the counter can scan to earn and redeem."
        />
      )}
    </ScrollView>
  )
}
