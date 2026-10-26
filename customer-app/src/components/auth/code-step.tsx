import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { formatCountdown, isCompleteCode, isPrototypeCodeAccepted } from '@/lib/auth/code-input'
import { formatPhoneForDisplay } from '@/lib/phone'
import { useTokens } from '@/theme/theme-context'
import { CodeBoxes } from './code-boxes'
import { useResendCountdown } from './use-resend-countdown'

const VERIFY_DELAY_MS = 600

interface CodeStepProps {
  phoneE164: string
  onVerified: () => void
  onChangeNumber: () => void
}

export function CodeStep({ phoneE164, onVerified, onChangeNumber }: CodeStepProps) {
  const { space } = useTokens()
  const [code, setCode] = useState('')
  const [hasError, setHasError] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [sentAt, setSentAt] = useState(() => Date.now())
  const secondsLeft = useResendCountdown(sentAt)

  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current)
  }, [])

  // Prototype: Phase 3 POSTs /auth/otp/verify; any code but 000000 passes here.
  const verify = (candidate: string) => {
    setIsVerifying(true)
    verifyTimer.current = setTimeout(() => {
      setIsVerifying(false)
      if (isPrototypeCodeAccepted(candidate)) onVerified()
      else {
        setHasError(true)
        setCode('')
      }
    }, VERIFY_DELAY_MS)
  }

  return (
    <View style={{ gap: space.lg }}>
      <View>
        <AppText variant="display" accessibilityRole="header">
          Enter the code
        </AppText>
        <AppText variant="body" color="textMuted" style={{ marginTop: space.sm }}>
          We texted a 6-digit code to {formatPhoneForDisplay(phoneE164)}.
        </AppText>
        <PressableScale onPress={onChangeNumber} accessibilityLabel="Change number" style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
          <AppText variant="bodyStrong" color="primary">
            Change number
          </AppText>
        </PressableScale>
      </View>
      <CodeBoxes
        value={code}
        hasError={hasError}
        isDisabled={isVerifying}
        onChange={(next) => {
          setHasError(false)
          setCode(next)
          if (isCompleteCode(next)) verify(next)
        }}
      />
      <View style={{ minHeight: 24 }} accessibilityLiveRegion="polite">
        {isVerifying ? (
          <AppText variant="callout" color="textMuted" align="center">
            Checking…
          </AppText>
        ) : hasError ? (
          <AppText variant="callout" color="danger" align="center">
            That code isn’t right. Check the text and try again.
          </AppText>
        ) : null}
      </View>
      {secondsLeft > 0 ? (
        <AppText variant="callout" color="textMuted" align="center">
          Resend code in {formatCountdown(secondsLeft)}
        </AppText>
      ) : (
        <PressableScale
          onPress={() => {
            setSentAt(Date.now())
            setHasError(false)
            setCode('')
          }}
          accessibilityLabel="Resend code"
          style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}
        >
          <AppText variant="bodyStrong" color="primary">
            Resend code
          </AppText>
        </PressableScale>
      )}
    </View>
  )
}
