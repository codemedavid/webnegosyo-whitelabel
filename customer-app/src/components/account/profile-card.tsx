import { Pencil, UserRound } from 'lucide-react-native'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { formatPhoneForDisplay } from '@/lib/phone'
import type { MemberProfile } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

const AVATAR = 56

export function ProfileCard({ profile, onEditName }: { profile: MemberProfile; onEditName: () => void }) {
  const { colors, space, radius, elevation } = useTokens()
  const initial = profile.name?.trim().charAt(0).toUpperCase()
  return (
    <PressableScale
      scaleTo={0.985}
      onPress={onEditName}
      accessibilityLabel={profile.name ? `${profile.name}. Edit your name` : 'Add your name'}
      style={{
        marginHorizontal: space.lg,
        padding: space.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.lg,
        ...elevation.card,
      }}
    >
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {initial ? (
          <AppText variant="title" color="onPrimary">
            {initial}
          </AppText>
        ) : (
          <UserRound size={26} color={colors.onPrimary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="headline" numberOfLines={1} color={profile.name ? 'text' : 'textMuted'}>
          {profile.name ?? 'Add your name'}
        </AppText>
        <AppText variant="callout" color="textMuted">
          {formatPhoneForDisplay(profile.phoneE164)}
        </AppText>
      </View>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <Pencil size={18} color={colors.text} />
      </View>
    </PressableScale>
  )
}
