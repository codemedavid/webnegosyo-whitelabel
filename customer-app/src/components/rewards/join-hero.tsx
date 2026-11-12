import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Gift, ShoppingBag, Stamp, type LucideIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useTokens } from '@/theme/theme-context'

const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: ShoppingBag, title: 'Order', body: 'In the app or at the counter' },
  { Icon: Stamp, title: 'Collect', body: 'A stamp lands on every order' },
  { Icon: Gift, title: 'Enjoy', body: 'Your reward is on us' },
]

interface JoinHeroProps {
  title: string
  body: string
}

/** What guests see on Rewards: the promise, how it works, and one button. */
export function JoinHero({ title, body }: JoinHeroProps) {
  const { colors, space, radius } = useTokens()
  return (
    <View style={{ gap: space.xl }}>
      <LinearGradient
        colors={[colors.primary, colors.primary, colors.accent]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ marginHorizontal: space.lg, borderRadius: radius.xl, padding: space.xl }}
      >
        <AppText variant="label" color="onPrimary" style={{ opacity: 0.85 }}>
          MEMBERS EARN MORE
        </AppText>
        <AppText variant="display" color="onPrimary" style={{ marginTop: space.sm }} accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="body" color="onPrimary" style={{ marginTop: space.sm, marginBottom: space.xl, opacity: 0.92 }}>
          {body}
        </AppText>
        <Button label="Join or sign in" variant="secondary" size="lg" onPress={() => router.push('/sign-in')} />
      </LinearGradient>
      <View style={{ paddingHorizontal: space.lg }}>
        <AppText variant="title" accessibilityRole="header" style={{ marginBottom: space.md }}>
          How it works
        </AppText>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {STEPS.map(({ Icon, title: stepTitle, body: stepBody }, index) => (
            <View
              key={stepTitle}
              accessible
              accessibilityLabel={`Step ${index + 1}, ${stepTitle}. ${stepBody}`}
              style={{ flex: 1, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: space.sm }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={20} color={colors.onPrimarySoft} />
              </View>
              <AppText variant="headline">{stepTitle}</AppText>
              <AppText variant="caption" color="textMuted">
                {stepBody}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
