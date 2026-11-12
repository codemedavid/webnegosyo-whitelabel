import { View } from 'react-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useTokens } from '@/theme/theme-context'

export function RewardsSkeleton() {
  const { space, radius } = useTokens()
  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.xl }}>
      <Skeleton height={340} radius={radius.xl} />
      <Skeleton height={24} width={160} />
      <Skeleton height={80} radius={radius.lg} />
      <Skeleton height={24} width={120} />
      <Skeleton height={160} radius={radius.lg} />
    </View>
  )
}
