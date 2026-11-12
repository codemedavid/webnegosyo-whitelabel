import { router } from 'expo-router'
import { ChevronRight, MapPin, Navigation, TriangleAlert } from 'lucide-react-native'
import { View } from 'react-native'
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

function feeLine(address: CheckoutModel['address']): { text: string; tone: 'textMuted' | 'danger' } | null {
  if (!address.place) return null
  if (address.feeStatus === 'quoting') return { text: 'Checking the delivery fee…', tone: 'textMuted' }
  if (address.feeStatus === 'refused') return { text: address.refusal ?? 'This branch doesn’t deliver to that address.', tone: 'danger' }
  if (address.feeStatus === 'failed') return { text: 'We couldn’t price delivery to this address. Tap to try again.', tone: 'danger' }
  return address.summary ? { text: address.summary, tone: 'textMuted' } : null
}

/** The picked place and its fee; tapping opens the address search. Typed text never makes a delivery. */
function DeliveryAddress({ model }: { model: CheckoutModel }) {
  const { colors, space, radius } = useTokens()
  const { address } = model
  const line = feeLine(address)
  return (
    <View style={{ gap: space.xs }}>
      <PressableScale
        onPress={address.open}
        scaleTo={0.99}
        accessibilityLabel={address.place ? `Delivering to ${address.place.address}. Change address` : 'Add a delivery address'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: 64,
          padding: space.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Navigation size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textMuted">
            {address.place ? 'Delivering to' : 'Delivery address'}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {address.place ? address.place.address : 'Search for your street, building or landmark'}
          </AppText>
        </View>
        <AppText variant="callout" color="primary">
          {address.place ? 'Change' : 'Add'}
        </AppText>
      </PressableScale>
      {line ? (
        address.feeStatus === 'failed' ? (
          <PressableScale onPress={address.retry} accessibilityRole="button" accessibilityLabel="Try pricing delivery again">
            <AppText variant="caption" color={line.tone} accessibilityLiveRegion="polite">
              {line.text}
            </AppText>
          </PressableScale>
        ) : (
          <AppText variant="caption" color={line.tone} accessibilityLiveRegion="polite">
            {line.text}
          </AppText>
        )
      ) : null}
      {address.place ? (
        <AppText variant="caption" color="textMuted">
          Add your unit, floor or gate code in Notes.
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
