import { router } from 'expo-router'
import { Receipt } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import { SignInPrompt } from '@/components/auth/sign-in-prompt'
import { OrderCard } from '@/components/orders/order-card'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrders } from '@/lib/data/hooks'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

function HistorySkeleton() {
  const { space } = useTokens()
  return (
    <View style={{ padding: space.lg, gap: space.md }}>
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} height={128} />
      ))}
    </View>
  )
}

function EmptyHistory() {
  const { space } = useTokens()
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.md }}>
      <AppText variant="title" align="center">
        No orders yet
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        Your orders show up here, so reordering a favourite is one tap.
      </AppText>
      <Button label="Start an order" onPress={() => router.navigate('/order')} style={{ marginTop: space.md }} />
    </View>
  )
}

export default function OrderHistoryScreen() {
  const { colors, space } = useTokens()
  const isMember = useSession((state) => state.status === 'member')
  const { data: orders, isPending, refetch, isRefetching } = useOrders()
  // One clock per screen visit, so every card says "Today" against the same day.
  const [now] = useState(() => new Date())

  if (!isMember)
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <SignInPrompt Icon={Receipt} title="Your orders live here" body="Sign in with your number to see past orders and reorder in one tap." />
      </View>
    )
  if (isPending) return <HistorySkeleton />

  return (
    <FlatList
      data={orders ?? []}
      keyExtractor={(order) => order.id}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingVertical: space.lg, gap: space.md }}
      renderItem={({ item }) => <OrderCard order={item} now={now} />}
      ListEmptyComponent={<EmptyHistory />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
    />
  )
}
