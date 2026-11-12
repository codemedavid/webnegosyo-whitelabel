import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { AppApiError } from '@/lib/api/app-client'
import { useTokens } from '@/theme/theme-context'

const MAX_NAME = 60

interface NameStepProps {
  /** Saves (or skips) the name; a rejection keeps the step open with the reason. */
  onDone: (name: string | null) => Promise<void>
}

const SAVE_FAILED = 'We couldn’t save your name. You can add it later in Account.'

/** Optional: the store calls out orders by name, but nobody has to give one. */
export function NameStep({ onDone }: NameStepProps) {
  const { colors, space, radius, type } = useTokens()
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const trimmed = name.trim()
  const finish = async (value: string | null) => {
    setIsSaving(true)
    setSaveError(null)
    try {
      await onDone(value)
    } catch (error) {
      setSaveError(error instanceof AppApiError && error.code === 'bad_request' ? error.message : SAVE_FAILED)
      setIsSaving(false)
    }
  }
  return (
    <View style={{ gap: space.lg }}>
      <View>
        <AppText variant="display" accessibilityRole="header">
          You’re in! What should we call you?
        </AppText>
        <AppText variant="body" color="textMuted" style={{ marginTop: space.sm }}>
          We’ll use it to call out your order.
        </AppText>
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={MAX_NAME}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        placeholder="Your name"
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        onSubmitEditing={() => void finish(trimmed || null)}
        accessibilityLabel="Your name"
        style={[
          type.title,
          {
            color: colors.text,
            minHeight: 60,
            paddingHorizontal: space.lg,
            borderRadius: radius.lg,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: colors.surface,
          },
        ]}
      />
      {saveError ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
          {saveError}
        </AppText>
      ) : null}
      <Button label="Continue" size="lg" disabled={trimmed === ''} isBusy={isSaving} onPress={() => void finish(trimmed)} />
      <Button label="Skip for now" variant="ghost" disabled={isSaving} onPress={() => void finish(null)} />
    </View>
  )
}
