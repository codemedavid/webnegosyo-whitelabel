import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { BagSection } from '@/components/checkout/bag-section'
import { CheckoutSection } from '@/components/checkout/checkout-section'
import { ContactSection } from '@/components/checkout/contact-section'
import { EmptyBag } from '@/components/checkout/empty-bag'
import { FulfillmentSection } from '@/components/checkout/fulfillment-section'
import { NotesSection } from '@/components/checkout/notes-section'
import { PaymentSection } from '@/components/checkout/payment-section'
import { PlaceOrderBar } from '@/components/checkout/place-order-bar'
import { SavingsSection } from '@/components/checkout/savings-section'
import { useCheckout } from '@/components/checkout/use-checkout'
import { TotalsRows } from '@/components/orders/totals-rows'
import { Skeleton } from '@/components/ui/skeleton'
import { useTokens } from '@/theme/theme-context'

function CheckoutSkeleton() {
  const { space } = useTokens()
  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <Skeleton height={180} />
      <Skeleton height={120} />
      <Skeleton height={160} />
    </View>
  )
}

/** "Review order": one scroll of plain sections, the total and the button always in reach. */
export default function CheckoutScreen() {
  const { colors, space } = useTokens()
  const model = useCheckout()

  if (!model.isReady) return <CheckoutSkeleton />
  if (model.itemCount === 0 && !model.isPlacing) return <EmptyBag />

  const { totals } = model
  const isDelivery = model.mode === 'delivery'
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <BagSection lines={model.lines} itemCount={model.itemCount} />
        <FulfillmentSection model={model} />
        <ContactSection />
        <PaymentSection methods={model.paymentMethods} selected={model.paymentMethod} onSelect={model.pickPayment} />
        {model.isMember ? <SavingsSection model={model} /> : null}
        <NotesSection value={model.notes} onChange={model.setNotes} />
        <CheckoutSection title="Summary">
          <TotalsRows
            subtotalCentavos={totals.subtotalCentavos}
            discountCentavos={totals.discountCentavos}
            deliveryFeeCentavos={totals.deliveryFeeCentavos}
            totalCentavos={totals.totalCentavos}
            showDelivery={isDelivery}
            deliveryNote={isDelivery && !model.address.quote ? 'Add an address' : null}
          />
        </CheckoutSection>
      </ScrollView>
      <PlaceOrderBar
        totalCentavos={totals.totalCentavos}
        blocker={model.blockers[0] ?? null}
        error={model.placeError}
        isPlacing={model.isPlacing}
        onPlace={model.submit}
        isGuest={!model.isMember}
      />
    </KeyboardAvoidingView>
  )
}
