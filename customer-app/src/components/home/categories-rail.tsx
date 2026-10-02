import { router } from 'expo-router'
import { ScrollView, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { SectionHeader } from '@/components/ui/section-header'
import type { AppCategory } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'

export function CategoriesRail({ title, categories }: { title: string; categories: AppCategory[] }) {
  const { colors, space, radius } = useTokens()
  if (categories.length === 0) return null
  return (
    <View>
      <SectionHeader title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {categories.map((category) => (
          <PressableScale
            key={category.id}
            onPress={() => router.push({ pathname: '/order', params: { category: category.id } })}
            style={{
              paddingHorizontal: space.lg,
              minHeight: 44,
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppText variant="bodyStrong">{category.name}</AppText>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  )
}
