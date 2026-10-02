import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, useState } from 'react'
import { FlatList, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppBanner } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'

const ASPECT = { landscape: 16 / 9, square: 1, portrait: 4 / 5 } as const
const AUTOPLAY_MS = 5000

interface BannerCarouselProps {
  banners: AppBanner[]
  format: keyof typeof ASPECT
  autoplay: boolean
  onBannerPress: (banner: AppBanner) => void
}

export function BannerCarousel({ banners, format, autoplay, onBannerPress }: BannerCarouselProps) {
  const { colors, space, radius } = useTokens()
  const { width: screenWidth } = useWindowDimensions()
  const width = screenWidth - space.lg * 2
  const height = width / ASPECT[format]
  const [index, setIndex] = useState(0)
  const listRef = useRef<FlatList<AppBanner>>(null)
  const isDragging = useRef(false)

  useEffect(() => {
    if (!autoplay || banners.length < 2) return undefined
    const timer = setInterval(() => {
      if (isDragging.current) return
      const next = (index + 1) % banners.length
      listRef.current?.scrollToOffset({ offset: next * (width + space.md), animated: true })
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [autoplay, banners.length, index, space.md, width])

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDragging.current = false
    setIndex(Math.round(event.nativeEvent.contentOffset.x / (width + space.md)))
  }

  return (
    <View>
      <FlatList
        ref={listRef}
        data={banners}
        horizontal
        keyExtractor={(banner) => banner.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={width + space.md}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
        onScrollBeginDrag={() => (isDragging.current = true)}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item: banner }) => (
          <PressableScale
            scaleTo={0.985}
            onPress={() => onBannerPress(banner)}
            accessibilityLabel={[banner.title, banner.subtitle].filter(Boolean).join('. ') || 'Promotion'}
            style={{ width, height, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surfaceMuted }}
          >
            <Image source={{ uri: banner.imageUrl }} style={{ flex: 1 }} contentFit="cover" transition={250} />
            {banner.title ? (
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.72)']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingTop: space.xxxl }}
              >
                <AppText variant="title" style={{ color: '#FFFFFF' }}>
                  {banner.title}
                </AppText>
                {banner.subtitle ? (
                  <AppText variant="callout" style={{ color: '#FFFFFF', opacity: 0.88, marginTop: space.xxs }}>
                    {banner.subtitle}
                  </AppText>
                ) : null}
              </LinearGradient>
            ) : null}
          </PressableScale>
        )}
      />
      {banners.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.md }}>
          {banners.map((banner, dotIndex) => (
            <View
              key={banner.id}
              style={{
                width: dotIndex === index ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: dotIndex === index ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}
