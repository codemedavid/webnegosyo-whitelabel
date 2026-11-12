import { router, useLocalSearchParams } from 'expo-router'
import { SearchX } from 'lucide-react-native'
import { View, useWindowDimensions } from 'react-native'
import { ItemDetail } from '@/components/item/item-detail'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCatalog } from '@/lib/data/hooks'
import { useTokens } from '@/theme/theme-context'

function ItemSkeleton() {
  const { colors, space } = useTokens()
  const { width } = useWindowDimensions()
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Skeleton width={width} height={width * 0.86} radius={0} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Skeleton height={30} width="70%" />
        <Skeleton height={16} />
        <Skeleton height={16} width="80%" />
        <Skeleton height={24} width="25%" />
      </View>
    </View>
  )
}

function ItemNotFound() {
  const { colors, space } = useTokens()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: colors.background }}>
      <SearchX size={44} color={colors.textMuted} />
      <AppText variant="title" align="center" style={{ marginTop: space.lg }}>
        This item is off the menu
      </AppText>
      <AppText variant="body" color="textMuted" align="center" style={{ marginTop: space.sm, marginBottom: space.xl }}>
        It may have been removed or renamed. Have a look at what’s on today.
      </AppText>
      <Button label="Back to the menu" onPress={() => router.back()} />
    </View>
  )
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: catalog, isPending } = useCatalog()
  if (isPending) return <ItemSkeleton />
  const item = catalog?.items.find((candidate) => candidate.id === id)
  if (!item) return <ItemNotFound />
  return <ItemDetail key={item.id} item={item} />
}
