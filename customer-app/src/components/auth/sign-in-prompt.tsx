import { router } from 'expo-router'
import type { LucideIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useTokens } from '@/theme/theme-context'

interface SignInPromptProps {
  Icon: LucideIcon
  title: string
  body: string
}

/** The guest's way in from any member-only screen. */
export function SignInPrompt({ Icon, title, body }: SignInPromptProps) {
  const { colors, space, radius, elevation } = useTokens()
  return (
    <View
      style={{
        marginHorizontal: space.lg,
        padding: space.xl,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        alignItems: 'center',
        ...elevation.card,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.lg,
        }}
      >
        <Icon size={30} color={colors.onPrimarySoft} />
      </View>
      <AppText variant="title" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="body" color="textMuted" align="center" style={{ marginTop: space.sm, marginBottom: space.xl }}>
        {body}
      </AppText>
      <Button label="Join or sign in" size="lg" onPress={() => router.push('/sign-in')} style={{ alignSelf: 'stretch' }} />
    </View>
  )
}
