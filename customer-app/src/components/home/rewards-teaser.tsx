import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Gift } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useLoyalty } from '@/lib/data/hooks'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

/** "N rewards ready to use" for a member who has some; null = keep the store's own words. */
const readyLine = (count: number) => (count > 0 ? `You have ${count} reward${count === 1 ? '' : 's'} ready to use.` : null)

/** The store's rewards pitch. Guests are sent to sign in; members to their rewards (with what's ready, from the same card). */
export function RewardsTeaser({ title, body }: { title: string; body: string }) {
  const { colors, space, radius } = useTokens()
  const isMember = useSession((state) => state.status === 'member')
  const { data: loyalty } = useLoyalty()
  const memberLine = isMember ? readyLine(loyalty?.rewards.length ?? 0) : null
  return (
    <LinearGradient
      colors={[colors.accent, colors.primarySoft]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ marginHorizontal: space.lg, borderRadius: radius.xl, padding: space.xl }}
    >
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', marginBottom: space.md }}>
        <Gift size={28} color={colors.onAccent} />
        <AppText variant="title" color="onAccent" style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>
      <AppText variant="body" color="onAccent" style={{ marginBottom: space.lg }}>
        {memberLine ?? body}
      </AppText>
      {isMember ? (
        <Button label="See your rewards" variant="secondary" onPress={() => router.push('/rewards')} />
      ) : (
        <Button label="Start collecting" variant="secondary" onPress={() => router.push('/sign-in')} />
      )}
    </LinearGradient>
  )
}
