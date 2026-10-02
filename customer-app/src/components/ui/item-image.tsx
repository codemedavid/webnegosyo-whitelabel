import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useTokens } from '@/theme/theme-context'
import { AppText } from './app-text'

interface ItemImageProps {
  uri: string | null
  name: string
  style?: StyleProp<ViewStyle>
  radius?: number
  contentFit?: 'cover' | 'contain'
}

/**
 * A dish photo, or — for the many dishes without one — a brand-tinted card
 * with the dish's initial, so a photo-less menu still looks deliberate.
 */
export function ItemImage({ uri, name, style, radius, contentFit = 'cover' }: ItemImageProps) {
  const { colors, radius: scale, type } = useTokens()
  const [hasFailed, setHasFailed] = useState(false)
  const borderRadius = radius ?? scale.lg
  const initial = name.trim().charAt(0).toUpperCase() || '•'

  return (
    <View style={[{ borderRadius, overflow: 'hidden', backgroundColor: colors.surfaceMuted }, style]}>
      {uri && !hasFailed ? (
        <Image
          source={{ uri }}
          style={{ flex: 1 }}
          contentFit={contentFit}
          transition={220}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
          onError={() => setHasFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={[colors.primarySoft, colors.surfaceMuted]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText style={[type.display, { fontSize: 34, lineHeight: 40, opacity: 0.55 }]} color="onPrimarySoft">
            {initial}
          </AppText>
        </LinearGradient>
      )}
    </View>
  )
}
