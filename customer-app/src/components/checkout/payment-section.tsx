import { Banknote, CreditCard, Smartphone, type LucideIcon } from 'lucide-react-native'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import type { AppPaymentKind, AppPaymentMethod } from '@/lib/contract'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'

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
}

function ReferenceField({ method, value, onChange }: { method: AppPaymentMethod; value: string; onChange: (next: string) => void }) {
  const { colors, space, radius, type } = useTokens()
  return (
    <View style={{ gap: space.xs, marginTop: space.sm }}>
      <AppText variant="label" color="textMuted">
        REFERENCE NUMBER
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
        accessibilityHint="Required to place the order"
        style={[type.body, { color: colors.text, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface }]}
      />
      <AppText variant="caption" color="textMuted">
        Pay with {method.name} first, then type the reference number from your receipt so the store can match it.
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

export function PaymentSection({ methods, selected, onSelect, reference, onReferenceChange }: PaymentSectionProps) {
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
          {selected.requiresProof ? <ReferenceField method={selected} value={reference} onChange={onReferenceChange} /> : null}
        </View>
      ) : null}
    </CheckoutSection>
  )
}
