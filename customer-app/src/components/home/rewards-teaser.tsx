import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Gift } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useTokens } from '@/theme/theme-context'

export function RewardsTeaser({ title, body }: { title: string; body: string }) {
  const { colors, space, radius } = useTokens()
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
        {body}
      </AppText>
      <Button label="Start collecting" variant="secondary" onPress={() => router.push('/sign-in')} />
    </LinearGradient>
  )
}
