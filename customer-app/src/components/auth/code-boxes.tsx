import { useEffect, useRef } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { CODE_LENGTH, sanitizeCode } from '@/lib/auth/code-input'
import { useTokens } from '@/theme/theme-context'

interface CodeBoxesProps {
  value: string
  onChange: (code: string) => void
  hasError: boolean
  isDisabled: boolean
}

/**
 * Six boxes over ONE hidden input, so iOS "From Messages" autofill, Android
 * SMS autofill and paste all land in one go.
 */
export function CodeBoxes({ value, onChange, hasError, isDisabled }: CodeBoxesProps) {
  const { colors, space, radius, type } = useTokens()
  const inputRef = useRef<TextInput>(null)
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1)
  // Keep the keyboard up after a wrong code so they can type again straight away.
  useEffect(() => {
    if (hasError) inputRef.current?.focus()
  }, [hasError])
  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Enter the 6-digit code" accessibilityRole="none">
      <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'center' }}>
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const isActive = index === activeIndex && !isDisabled
          const borderColor = hasError ? colors.danger : isActive ? colors.primary : colors.border
          return (
            <View
              key={index}
              style={{
                flex: 1,
                maxWidth: 52,
                aspectRatio: 0.82,
                borderRadius: radius.md,
                borderWidth: isActive || hasError ? 2 : 1.5,
                borderColor,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="title" style={{ fontSize: 26, lineHeight: 32 }}>
                {value[index] ?? ''}
              </AppText>
            </View>
          )
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        // Never `editable={false}` while checking: that drops focus and hides the keyboard.
        onChangeText={(text) => {
          if (!isDisabled) onChange(sanitizeCode(text))
        }}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LENGTH * 4}
        caretHidden
        accessibilityLabel="Verification code"
        style={[type.body, { position: 'absolute', opacity: 0, width: 1, height: 1 }]}
      />
    </Pressable>
  )
}
