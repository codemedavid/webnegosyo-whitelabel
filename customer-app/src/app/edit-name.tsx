import { router } from 'expo-router'
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { AppApiError } from '@/lib/api/app-client'
import { saveName } from '@/lib/auth/account-actions'
import { useSession } from '@/lib/stores/session'
import { useTokens } from '@/theme/theme-context'

const MAX_NAME = 60

/** Native form sheet (not an RN Modal) so the keyboard and the Save tap behave. */
export default function EditNameSheet() {
  const { colors, space, radius, type } = useTokens()
  const profile = useSession((state) => state.profile)
  const [name, setDraft] = useState(profile?.name ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await saveName(name.trim() ? name.trim() : null)
      router.back()
    } catch (caught) {
      setError(caught instanceof AppApiError && caught.code !== 'internal' ? caught.message : 'We couldn’t save your name. Please try again.')
      setIsSaving(false)
    }
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
        onSubmitEditing={() => void save()}
        style={[
          type.body,
          { color: colors.text, minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
        ]}
      />
      {error ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Button label="Save" size="lg" isBusy={isSaving} onPress={() => void save()} />
    </View>
  )
}
