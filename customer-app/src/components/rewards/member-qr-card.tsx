import { Image } from 'expo-image'
import { useWindowDimensions, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { QrCode } from '@/components/ui/qr-code'
import { maskPhone } from '@/lib/auth/code-input'
import { useTokens } from '@/theme/theme-context'

const QR_MAX = 260
const CARD_INSET = 96
/** Scanners need dark-on-light; this plate stays black on white whatever the brand. */
const QR_INK = '#000000'
const QR_PLATE = '#FFFFFF'

interface MemberQrCardProps {
  memberCode: string
  storeName: string
  memberName: string | null
  phoneE164: string
}

export function MemberQrCard({ memberCode, storeName, memberName, phoneE164 }: MemberQrCardProps) {
  const { colors, space, radius, elevation, logoUrl } = useTokens()
  const { width } = useWindowDimensions()
  const qrSize = Math.min(QR_MAX, width - CARD_INSET)
  return (
    <View style={{ marginHorizontal: space.lg, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, ...elevation.raised }}>
      <View style={{ backgroundColor: colors.primary, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface }}
            accessibilityLabel={`${storeName} logo`}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText variant="label" color="onPrimary" style={{ opacity: 0.85 }}>
            MEMBER CARD
          </AppText>
          <AppText variant="headline" color="onPrimary" numberOfLines={1}>
            {storeName}
          </AppText>
        </View>
      </View>
      <View style={{ alignItems: 'center', padding: space.xl }}>
        <View style={{ padding: space.md, borderRadius: radius.lg, backgroundColor: QR_PLATE }}>
          <QrCode value={memberCode} size={qrSize} color={QR_INK} background={QR_PLATE} />
        </View>
        <AppText variant="title" align="center" style={{ marginTop: space.lg }} numberOfLines={1}>
          {memberName ?? 'Member'}
        </AppText>
        <AppText variant="callout" color="textMuted" align="center" style={{ marginTop: space.xxs }}>
          {maskPhone(phoneE164)}
        </AppText>
      </View>
    </View>
  )
}
