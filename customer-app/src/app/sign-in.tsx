import { router } from 'expo-router'
import { ChevronLeft, X } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import Animated, { FadeInRight } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CodeStep } from '@/components/auth/code-step'
import { NameStep } from '@/components/auth/name-step'
import { PhoneStep } from '@/components/auth/phone-step'
import { PressableScale } from '@/components/ui/pressable-scale'
import { useAppConfig } from '@/lib/data/hooks'
import { completeSignIn, saveName } from '@/lib/auth/account-actions'
import type { AppOtpVerifyResult } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'

type Step = { name: 'phone'; phoneE164?: string } | { name: 'code'; phoneE164: string; challengeId: string } | { name: 'name' }

const dismiss = () => (router.canGoBack() ? router.back() : router.replace('/'))

function HeaderButton({ step, onBack }: { step: Step; onBack: () => void }) {
  const { colors, space } = useTokens()
  const isBack = step.name === 'code'
  if (step.name === 'name') return <View style={{ height: 44 }} />
  return (
    <PressableScale
      onPress={isBack ? onBack : dismiss}
      accessibilityLabel={isBack ? 'Back' : 'Close'}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -space.xs,
      }}
    >
      {isBack ? <ChevronLeft size={22} color={colors.text} /> : <X size={20} color={colors.text} />}
    </PressableScale>
  )
}

export default function SignInScreen() {
  const { colors, space } = useTokens()
  const insets = useSafeAreaInsets()
  const { data: config } = useAppConfig()
  const [step, setStep] = useState<Step>({ name: 'phone' })
  const phoneE164 = step.name === 'code' ? step.phoneE164 : null

  const onVerified = useCallback(async (result: AppOtpVerifyResult) => {
    // Returning customers who already gave a name go straight back to where they were.
    if (await completeSignIn(result)) setStep({ name: 'name' })
    else dismiss()
  }, [])

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingTop: (Platform.OS === 'android' ? insets.top : 0) + space.lg, gap: space.xl }}
      >
        <HeaderButton step={step} onBack={() => setStep({ name: 'phone', phoneE164: phoneE164 ?? undefined })} />
        <Animated.View key={step.name} entering={FadeInRight.springify().damping(20)}>
          {step.name === 'phone' ? (
            <PhoneStep
              storeName={config?.tenant.name ?? 'the store'}
              initialPhoneE164={step.phoneE164}
              onSent={(phone, challengeId) => setStep({ name: 'code', phoneE164: phone, challengeId })}
            />
          ) : step.name === 'code' ? (
            <CodeStep
              phoneE164={step.phoneE164}
              challengeId={step.challengeId}
              onVerified={(result) => void onVerified(result)}
              onChangeNumber={() => setStep({ name: 'phone', phoneE164: step.phoneE164 })}
            />
          ) : (
            <NameStep
              onDone={async (name) => {
                if (name) await saveName(name)
                dismiss()
              }}
            />
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
