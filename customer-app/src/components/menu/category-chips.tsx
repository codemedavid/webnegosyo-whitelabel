import { useEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppCategory } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'

interface CategoryChipsProps {
  categories: AppCategory[]
  activeIndex: number
  onSelect: (index: number) => void
}

const CHIP_SPACING_ESTIMATE = 110

/** Sticky chip rail; the active chip follows the scroll and keeps itself in view. */
export function CategoryChips({ categories, activeIndex, onSelect }: CategoryChipsProps) {
  const { colors, space, radius } = useTokens()
  const scrollRef = useRef<ScrollView>(null)
  const offsets = useRef<number[]>([])

  useEffect(() => {
    const x = offsets.current[activeIndex] ?? activeIndex * CHIP_SPACING_ESTIMATE
    scrollRef.current?.scrollTo({ x: Math.max(0, x - space.lg), animated: true })
  }, [activeIndex, space.lg])

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingVertical: space.sm }}
      accessibilityRole="tablist"
    >
      {categories.map((category, index) => {
        const isActive = index === activeIndex
        return (
          <View key={category.id} onLayout={(event) => (offsets.current[index] = event.nativeEvent.layout.x)}>
            <PressableScale
              haptic="selection"
              onPress={() => onSelect(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={{
                paddingHorizontal: space.lg,
                minHeight: 38,
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: isActive ? colors.text : colors.surface,
                borderWidth: 1,
                borderColor: isActive ? colors.text : colors.border,
              }}
            >
              <AppText variant="bodyStrong" style={{ color: isActive ? colors.surface : colors.text }}>
                {category.name}
              </AppText>
            </PressableScale>
          </View>
        )
      })}
    </ScrollView>
  )
}
