import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { BagNotice } from '@/components/checkout/bag-notice'
import { BagSection } from '@/components/checkout/bag-section'
import { CheckoutSection } from '@/components/checkout/checkout-section'
import { ContactSection } from '@/components/checkout/contact-section'
import { EmptyBag } from '@/components/checkout/empty-bag'
import { FulfillmentSection } from '@/components/checkout/fulfillment-section'
import { NotesSection } from '@/components/checkout/notes-section'
import { PaymentSection } from '@/components/checkout/payment-section'
import { PlaceOrderBar } from '@/components/checkout/place-order-bar'
import { QuestionsSection } from '@/components/checkout/questions-section'
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
  const deliveryNote = !isDelivery
    ? null
    : !model.address.place
      ? 'Add an address'
      : model.address.feeStatus === 'quoting'
        ? 'Checking…'
        : !model.isFeeReady
          ? '—'
          : totals.deliveryFeeCentavos === 0
            ? 'Free'
            : null
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <ScrollView contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <BagNotice />
        <BagSection lines={model.lines} itemCount={model.itemCount} />
        <FulfillmentSection model={model} />
        <ContactSection />
        <QuestionsSection questions={model.questions} answers={model.answers} onAnswer={model.setAnswer} errors={model.questionErrors} />
        <PaymentSection
          methods={model.paymentMethods}
          selected={model.paymentMethod}
          onSelect={model.pickPayment}
          reference={model.paymentReference}
          onReferenceChange={model.setPaymentReference}
        />
        {model.isMember ? <SavingsSection model={model} /> : null}
        <NotesSection value={model.notes} onChange={model.setNotes} />
        <CheckoutSection title="Summary">
          <TotalsRows
            subtotalCentavos={totals.subtotalCentavos}
            discountCentavos={totals.discountCentavos}
            deliveryFeeCentavos={totals.deliveryFeeCentavos}
            totalCentavos={totals.totalCentavos}
            showDelivery={isDelivery}
            deliveryNote={deliveryNote}
          />
        </CheckoutSection>
      </ScrollView>
      <PlaceOrderBar
        totalCentavos={totals.totalCentavos}
        blocker={model.blockers[0] ?? null}
        failure={model.failure}
        notice={model.notice}
        isPlacing={model.isPlacing}
        onPlace={model.submit}
        isGuest={!model.isMember}
      />
    </KeyboardAvoidingView>
  )
}
