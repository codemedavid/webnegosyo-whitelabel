import { Image } from 'expo-image'
import { Banknote, CreditCard, ImagePlus, Smartphone, type LucideIcon } from 'lucide-react-native'
import { ActivityIndicator, TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { Button } from '@/components/ui/button'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppPaymentKind, AppPaymentMethod } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'
import type { PaymentProofState } from './use-payment-proof'

const ICONS: Record<AppPaymentKind, LucideIcon> = { online: CreditCard, manual: Smartphone, cash: Banknote }
const HINTS: Record<AppPaymentKind, string> = {
  online: 'Pay now in the app',
  manual: 'Send the payment yourself',
  cash: 'Pay when you get your order',
}

/** The order route takes 1–80 characters. */
const REFERENCE_MAX = 80

interface PaymentSectionProps {
  methods: AppPaymentMethod[]
  selected: AppPaymentMethod | undefined
  onSelect: (id: string) => void
  /** The typed proof for a method that requires it. */
  reference: string
  onReferenceChange: (reference: string) => void
  /** The payment screenshot (a proof method takes it OR the reference). */
  proof: { state: PaymentProofState; pick: () => void; remove: () => void }
}

function ScreenshotField({ method, proof }: { method: AppPaymentMethod; proof: PaymentProofSectionProof }) {
  const { colors, space, radius } = useTokens()
  const { state } = proof
  if (state.status === 'none')
    return (
      <View style={{ gap: space.xs, marginTop: space.sm }}>
        <AppText variant="label" color="textMuted">
          PAYMENT SCREENSHOT
        </AppText>
        <Button
          label="Add screenshot"
          variant="secondary"
          onPress={proof.pick}
          leading={<ImagePlus size={18} color={colors.text} />}
          accessibilityHint={`Choose the ${method.name} receipt from your photos`}
        />
      </View>
    )
  return (
    <View style={{ gap: space.xs, marginTop: space.sm }}>
      <AppText variant="label" color="textMuted">
        PAYMENT SCREENSHOT
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
          <Image source={{ uri: state.previewUri }} style={{ width: 64, height: 64 }} contentFit="cover" accessibilityIgnoresInvertColors />
          {state.status === 'uploading' ? (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" color={state.status === 'failed' ? 'danger' : 'text'} accessibilityLiveRegion="polite">
            {state.status === 'uploading' ? 'Uploading…' : state.status === 'ready' ? 'Screenshot added' : 'Upload failed'}
          </AppText>
          {state.status === 'failed' ? (
            <AppText variant="caption" color="textMuted">
              {state.error}
            </AppText>
          ) : null}
          {state.status === 'uploading' ? null : (
            <Button
              label={state.status === 'failed' ? 'Choose another' : 'Remove'}
              variant="ghost"
              onPress={state.status === 'failed' ? proof.pick : proof.remove}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
            />
          )}
        </View>
      </View>
    </View>
  )
}

type PaymentProofSectionProof = PaymentSectionProps['proof']

function ReferenceField({ method, value, onChange }: { method: AppPaymentMethod; value: string; onChange: (next: string) => void }) {
  const { colors, space, radius, type } = useTokens()
  return (
    <View style={{ gap: space.xs, marginTop: space.sm }}>
      <AppText variant="label" color="textMuted">
        OR TYPE THE REFERENCE NUMBER
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={REFERENCE_MAX}
        placeholder="e.g. 1012 345 678901"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel={`${method.name} reference number`}
        accessibilityHint="Needed when you add no screenshot"
        style={[type.body, { color: colors.text, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface }]}
      />
      <AppText variant="caption" color="textMuted">
        Pay with {method.name} first, then add a screenshot of the receipt or type its reference number so the store can match it.
      </AppText>
    </View>
  )
}

function Radio({ isSelected }: { isSelected: boolean }) {
  const { colors } = useTokens()
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: isSelected ? colors.primary : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isSelected ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
    </View>
  )
}

export function PaymentSection({ methods, selected, onSelect, reference, onReferenceChange, proof }: PaymentSectionProps) {
  const { colors, space, radius } = useTokens()
  if (methods.length === 0)
    return (
      <CheckoutSection title="Payment">
        <AppText variant="body" color="textMuted">
          You’ll pay the store directly for this order.
        </AppText>
      </CheckoutSection>
    )
  return (
    <CheckoutSection title="Payment">
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {methods.map((method) => {
          const isSelected = method.id === selected?.id
          const Icon = ICONS[method.kind]
          return (
            <PressableScale
              key={method.id}
              haptic="selection"
              scaleTo={0.99}
              onPress={() => onSelect(method.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${method.name}. ${HINTS[method.kind]}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 56,
                paddingHorizontal: space.md,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primarySoft : colors.surface,
              }}
            >
              <Icon size={22} color={isSelected ? colors.onPrimarySoft : colors.textMuted} />
              <View style={{ flex: 1, paddingVertical: space.sm }}>
                <AppText variant="bodyStrong" color={isSelected ? 'onPrimarySoft' : 'text'}>
                  {method.name}
                </AppText>
                <AppText variant="caption" color={isSelected ? 'onPrimarySoft' : 'textMuted'}>
                  {HINTS[method.kind]}
                </AppText>
              </View>
              <Radio isSelected={isSelected} />
            </PressableScale>
          )
        })}
      </View>
      {selected?.instructions || selected?.requiresProof ? (
        <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, gap: space.xs }}>
          {selected.instructions ? <AppText variant="callout">{selected.instructions}</AppText> : null}
          {selected.requiresProof ? (
            <>
              <ScreenshotField method={selected} proof={proof} />
              <ReferenceField method={selected} value={reference} onChange={onReferenceChange} />
            </>
          ) : null}
        </View>
      ) : null}
    </CheckoutSection>
  )
}
