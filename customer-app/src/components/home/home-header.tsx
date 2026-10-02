import { Image } from 'expo-image'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText } from '@/components/ui/app-text'
import { useTokens } from '@/theme/theme-context'

export const HEADER_OVERLAP = 64

interface HomeHeaderProps {
  greeting: string
  storeName: string
  /** True when the member card sits over the header's bottom edge. */
  hasOverlap: boolean
}

/** Brand-coloured panel the member card overlaps — the first thing a customer sees. */
export function HomeHeader({ greeting, storeName, hasOverlap }: HomeHeaderProps) {
  const { colors, space, radius, logoUrl } = useTokens()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        backgroundColor: colors.primary,
        paddingTop: insets.top + space.lg,
        paddingHorizontal: space.lg,
        paddingBottom: (hasOverlap ? HEADER_OVERLAP : 0) + space.xl,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface }}
            accessibilityLabel={`${storeName} logo`}
          />
        ) : null}
        <AppText variant="bodyStrong" color="onPrimary" style={{ opacity: 0.9 }}>
          {storeName}
        </AppText>
      </View>
      <AppText variant="display" color="onPrimary" accessibilityRole="header">
        {greeting}
      </AppText>
    </View>
  )
}
