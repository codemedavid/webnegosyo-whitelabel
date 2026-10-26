import { router } from 'expo-router'
import { ChevronRight, MapPin, TriangleAlert } from 'lucide-react-native'
import { TextInput, View } from 'react-native'
import { AppText } from '@/components/ui/app-text'
import { PressableScale } from '@/components/ui/pressable-scale'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { MODE_LABELS } from '@/lib/branch/mode-label'
import { formatPeso, toCentavos } from '@/lib/money'
import { useCart, type OrderMode } from '@/lib/stores/cart'
import { useTokens } from '@/theme/theme-context'
import { CheckoutSection } from './checkout-section'
import type { CheckoutModel } from './use-checkout'

const MODE_PREPOSITION: Record<OrderMode, string> = { pickup: 'Pick up from', delivery: 'Delivering from', dineIn: 'Dining at' }

function Warning({ text }: { text: string }) {
  const { colors, space, radius } = useTokens()
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}
    >
      <TriangleAlert size={16} color={colors.warning} />
      <AppText variant="callout" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  )
}

function DeliveryAddress({ model }: { model: CheckoutModel }) {
  const { colors, space, radius, type } = useTokens()
  const { address } = model
  const quoteLine = address.isQuoting
    ? 'Checking the delivery fee…'
    : address.hasQuoteFailed
      ? 'We couldn’t price delivery to this address. Try again.'
      : address.quote
        ? `${formatPeso(toCentavos(address.quote.fee))} delivery · about ${address.quote.etaMinutes} min`
        : null
  return (
    <View style={{ gap: space.sm }}>
      <TextInput
        value={address.draft}
        onChangeText={address.setDraft}
        onBlur={address.commit}
        onSubmitEditing={address.commit}
        placeholder="House no., street, barangay, city"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Delivery address"
        returnKeyType="done"
        multiline
        blurOnSubmit
        style={[
          type.body,
          { color: colors.text, minHeight: 64, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, textAlignVertical: 'top' },
        ]}
      />
      {quoteLine ? (
        <AppText variant="caption" color={address.hasQuoteFailed ? 'danger' : 'textMuted'}>
          {quoteLine}
        </AppText>
      ) : null}
    </View>
  )
}

/** How and where: the mode switch, the branch, and — for delivery — the address and its fee. */
export function FulfillmentSection({ model }: { model: CheckoutModel }) {
  const { colors, space } = useTokens()
  const setMode = useCart((state) => state.setMode)
  const { features, mode, outlet, orderType, shortfallCentavos } = model
  if (!features) return null
  const modes = (Object.keys(MODE_LABELS) as OrderMode[]).filter((candidate) => features.orderModes[candidate])
  return (
    <CheckoutSection title="How you’re getting it">
      <View style={{ gap: space.md }}>
        {modes.length > 1 ? (
          <SegmentedControl
            accessibilityLabel="How do you want your order?"
            options={modes.map((value) => ({ value, label: MODE_LABELS[value] }))}
            value={mode}
            onChange={setMode}
          />
        ) : null}
        {features.multiBranch ? (
          <PressableScale
            onPress={() => router.push('/branch')}
            accessibilityLabel={`${MODE_PREPOSITION[mode]} ${outlet?.name ?? 'choose a branch'}. Change branch`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}
          >
            <MapPin size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="textMuted">
                {MODE_PREPOSITION[mode]}
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {outlet?.name ?? 'Choose a branch'}
              </AppText>
              {outlet?.address ? (
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {outlet.address}
                </AppText>
              ) : null}
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </PressableScale>
        ) : null}
        {mode === 'delivery' ? <DeliveryAddress model={model} /> : null}
        {shortfallCentavos > 0 && orderType ? (
          <Warning text={`${orderType.name} starts at ${formatPeso(toCentavos(orderType.minimumOrder))}. Add ${formatPeso(shortfallCentavos)} more.`} />
        ) : null}
      </View>
    </CheckoutSection>
  )
}
