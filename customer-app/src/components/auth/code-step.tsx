import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { AppApiError } from '@/lib/api/app-client'
import { auth } from '@/lib/auth/account-actions'
import { formatCountdown, isCompleteCode } from '@/lib/auth/code-input'
import type { AppOtpVerifyResult } from '@/lib/contract'
import { formatPhoneForDisplay } from '@/lib/phone'
import { useTokens } from '@/theme/theme-context'
import { CodeBoxes } from './code-boxes'
import { useResendCountdown } from './use-resend-countdown'

const WRONG_CODE = 'That code isn’t right. Check the text and try again.'
const TRY_AGAIN = 'We couldn’t check the code. Check your connection and try again.'

interface CodeStepProps {
  phoneE164: string
  challengeId: string
  onVerified: (result: AppOtpVerifyResult) => void
  onChangeNumber: () => void
}

export function CodeStep({ phoneE164, challengeId: firstChallengeId, onVerified, onChangeNumber }: CodeStepProps) {
  const { space } = useTokens()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [challengeId, setChallengeId] = useState(firstChallengeId)
  const [sentAt, setSentAt] = useState(() => Date.now())
  const secondsLeft = useResendCountdown(sentAt)
  const isMounted = useRef(true)
  useEffect(
    () => () => {
      isMounted.current = false
    },
    [],
  )

  const verify = async (candidate: string) => {
    setIsVerifying(true)
    try {
      const result = await auth.verifyCode({ challengeId, phoneE164, code: candidate })
      if (isMounted.current) onVerified(result)
    } catch (caught) {
      if (!isMounted.current) return
      // Every wrong/expired/used code is `unauthorized`; limits and outages carry the server's own words.
      const isWrongCode = caught instanceof AppApiError && caught.code === 'unauthorized'
      setError(isWrongCode ? WRONG_CODE : caught instanceof AppApiError && caught.code !== 'internal' ? caught.message : TRY_AGAIN)
      setCode('')
    } finally {
      if (isMounted.current) setIsVerifying(false)
    }
  }

  const resend = async () => {
    setError(null)
    setCode('')
    try {
      const sent = await auth.requestCode(phoneE164)
      if (!isMounted.current) return
      setChallengeId(sent.challengeId)
      setSentAt(Date.now())
    } catch (caught) {
      if (isMounted.current) setError(caught instanceof AppApiError && caught.code !== 'internal' ? caught.message : TRY_AGAIN)
    }
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
        hasError={error !== null}
        isDisabled={isVerifying}
        onChange={(next) => {
          setError(null)
          setCode(next)
          if (isCompleteCode(next)) void verify(next)
        }}
      />
      <View style={{ minHeight: 24 }} accessibilityLiveRegion="polite">
        {isVerifying ? (
          <AppText variant="callout" color="textMuted" align="center">
            Checking…
          </AppText>
        ) : error ? (
          <AppText variant="callout" color="danger" align="center">
            {error}
          </AppText>
        ) : null}
      </View>
      {secondsLeft > 0 ? (
        <AppText variant="callout" color="textMuted" align="center">
          Resend code in {formatCountdown(secondsLeft)}
        </AppText>
      ) : (
        <PressableScale
          onPress={() => void resend()}
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
