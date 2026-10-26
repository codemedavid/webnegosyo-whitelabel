import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { useTokens } from '@/theme/theme-context'

const MAX_NAME = 60

interface NameStepProps {
  onDone: (name: string | null) => void
}

/** Optional: the store calls out orders by name, but nobody has to give one. */
export function NameStep({ onDone }: NameStepProps) {
  const { colors, space, radius, type } = useTokens()
  const [name, setName] = useState('')
  const trimmed = name.trim()
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
        onSubmitEditing={() => onDone(trimmed || null)}
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
      <Button label="Continue" size="lg" disabled={trimmed === ''} onPress={() => onDone(trimmed)} />
      <Button label="Skip for now" variant="ghost" onPress={() => onDone(null)} />
    </View>
  )
}
