import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { nationalDigits } from '@/lib/auth/code-input'
import { toPhilippineE164 } from '@/lib/phone'
import { useTokens } from '@/theme/theme-context'

const NATIONAL_LENGTH = 10
const SEND_DELAY_MS = 500

interface PhoneStepProps {
  storeName: string
  /** The number they typed before, when they come back to change it. */
  initialPhoneE164?: string
  onSent: (phoneE164: string) => void
}

export function PhoneStep({ storeName, initialPhoneE164, onSent }: PhoneStepProps) {
  const { colors, space, radius, type } = useTokens()
  const [digits, setDigits] = useState(() => (initialPhoneE164 ? nationalDigits(initialPhoneE164) : ''))
  const [isSending, setIsSending] = useState(false)
  const phoneE164 = toPhilippineE164(digits)
  const showsError = digits.length === NATIONAL_LENGTH && phoneE164 === null

  const send = () => {
    if (!phoneE164) return
    setIsSending(true)
    // Prototype: Phase 3 POSTs /auth/otp/request here.
    setTimeout(() => onSent(phoneE164), SEND_DELAY_MS)
  }

  return (
    <View style={{ gap: space.lg }}>
      <View>
        <AppText variant="display" accessibilityRole="header">
          What’s your number?
        </AppText>
        <AppText variant="body" color="textMuted" style={{ marginTop: space.sm }}>
          Sign in or join {storeName} with your mobile number. We’ll text you a 6-digit code.
        </AppText>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 60,
          borderRadius: radius.lg,
          borderWidth: 2,
          borderColor: showsError ? colors.danger : colors.primary,
          backgroundColor: colors.surface,
          paddingHorizontal: space.lg,
          gap: space.md,
        }}
      >
        <AppText variant="headline" color="textMuted">
          🇵🇭 +63
        </AppText>
        <View style={{ width: 1, alignSelf: 'stretch', marginVertical: space.md, backgroundColor: colors.border }} />
        <TextInput
          value={digits}
          onChangeText={(text) => setDigits(nationalDigits(text))}
          autoFocus
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="917 123 4567"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={send}
          accessibilityLabel="Mobile number, after plus 63"
          style={[type.title, { flex: 1, color: colors.text, letterSpacing: 1, paddingVertical: space.md }]}
        />
      </View>
      {showsError ? (
        <AppText variant="callout" color="danger" accessibilityLiveRegion="polite">
          Enter a Philippine mobile number — it starts with 9.
        </AppText>
      ) : null}
      <Button label="Send code" size="lg" onPress={send} disabled={!phoneE164} isBusy={isSending} />
      <AppText variant="caption" color="textMuted" align="center">
        Standard SMS rates may apply. We only use your number for your orders and rewards.
      </AppText>
    </View>
  )
}
