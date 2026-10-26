import { router } from 'expo-router'
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

const MAX_NAME = 60

/** Native form sheet (not an RN Modal) so the keyboard and the Save tap behave. */
export default function EditNameSheet() {
  const { colors, space, radius, type } = useTokens()
  const profile = useSession((state) => state.profile)
  const setName = useSession((state) => state.setName)
  const [name, setDraft] = useState(profile?.name ?? '')
  const save = () => {
    setName(name)
    router.back()
  }
  return (
    <View style={{ padding: space.xl, paddingTop: space.xxl, gap: space.lg, backgroundColor: colors.surface }}>
      <View>
        <AppText variant="title" accessibilityRole="header">
          Your name
        </AppText>
        <AppText variant="callout" color="textMuted" style={{ marginTop: space.xs }}>
          The store uses it to call out your order.
        </AppText>
      </View>
      <TextInput
        value={name}
        onChangeText={setDraft}
        autoFocus
        maxLength={MAX_NAME}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        placeholder="First and last name"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Your name"
        onSubmitEditing={save}
        style={[
          type.body,
          { color: colors.text, minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
        ]}
      />
      <Button label="Save" size="lg" onPress={save} />
    </View>
  )
}
