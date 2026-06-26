import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, ScrollView, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '@/theme/provider'
import { useCartStore, useCartHydrated } from '@/stores/cart-store'
import { useOrderTypes } from '@/lib/queries/use-order-types'
import { useFormFields } from '@/lib/queries/use-form-fields'
import { usePaymentMethods } from '@/lib/queries/use-payment-methods'
import { supabase } from '@/lib/supabase'
import { formatPrice, generateMessengerMessage, generateMessengerUrl, generateMessengerCombinedUrl, generateMessengerDirectUrl } from '@/lib/cart-utils'
import { DynamicForm } from '@/components/checkout/dynamic-form'
import { PaymentMethodCard } from '@/components/checkout/payment-method-card'
import { AdvanceOrderScheduler } from '@/components/checkout/advance-order-scheduler'
import { CartSummary } from '@/components/cart/cart-summary'
import { Button } from '@/components/ui/button'
import { useOrderStore } from '@/stores/order-store'
import { resolveCustomerLookup, useCustomerHistoryHydrated, useCustomerHistoryStore } from '@/stores/customer-history-store'
import { postOrderToSheets } from '@/lib/google-sheets'
import {
  getAdvanceOrderConfig,
  generateScheduleDates,
  generateTimeSlots,
  getFirstAvailableSlot,
  combineDateAndTime,
  formatScheduledFor,
  isValidScheduledTime,
} from '@/lib/advance-order-utils'
import { normalizeOperatingHours } from '@/lib/operating-hours'
import { getPaymentProofError, isPaymentProofRequired } from '@/lib/payment-proof'
import { pickAndUploadPaymentProof, deletePaymentProof, isImageKitConfigured } from '@/lib/imagekit-upload'
import { PaymentProofField } from '@/components/checkout/payment-proof-field'
import type { OrderType, PaymentMethod, CustomerFormField } from '@/types/database'

export default function CheckoutScreen() {
  const { theme, tenant } = useTheme()
  const isHydrated = useCartHydrated()
  const isCustomerHistoryHydrated = useCustomerHistoryHydrated()
  const { items, total, clearCart, orderType: storedOrderTypeId } = useCartStore()
  const { data: orderTypes = [] } = useOrderTypes(tenant?.id)
  const historyByKey = useCustomerHistoryStore(s => s.historyByKey)

  // Auto-resolve order type from cart store (already selected on homepage)
  const selectedOrderType = useMemo<OrderType | null>(() => {
    if (!storedOrderTypeId || orderTypes.length === 0) return null
    return orderTypes.find(ot => ot.id === storedOrderTypeId) || null
  }, [storedOrderTypeId, orderTypes])

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState(1) // Step 1 = form, Step 2 = payment
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isCompletingCheckoutRef = useRef(false)

  // Payment proof (screenshot upload and/or reference number)
  const [paymentProofUrl, setPaymentProofUrl] = useState('')
  const [paymentProofPublicId, setPaymentProofPublicId] = useState('')
  const [paymentProofFilePath, setPaymentProofFilePath] = useState('')
  const [paymentProofReference, setPaymentProofReference] = useState('')
  const [isUploadingProof, setIsUploadingProof] = useState(false)

  // Advance order (scheduling) state — kept local to checkout, like the web version.
  const [scheduleMode, setScheduleMode] = useState<'asap' | 'scheduled'>('asap')
  const [scheduleDate, setScheduleDate] = useState<string>('') // YYYY-MM-DD (local)
  const [scheduleTime, setScheduleTime] = useState<string>('') // HH:MM (24h, local)
  // `now` drives slot availability; refreshed each minute so the cutoff stays accurate.
  const [now, setNow] = useState<Date>(() => new Date())

  // Operating hours constrain the per-day selectable window for scheduled slots only.
  const operatingHours = useMemo(
    () => normalizeOperatingHours(tenant?.operating_hours),
    [tenant?.operating_hours]
  )

  // Advance-order config + derived scheduling values for the selected order type.
  const advanceConfig = useMemo(
    () => getAdvanceOrderConfig(selectedOrderType),
    [selectedOrderType]
  )
  const scheduleDates = useMemo(
    () =>
      advanceConfig.enabled
        ? generateScheduleDates(advanceConfig, now, operatingHours).filter(
            (d) => generateTimeSlots(advanceConfig, d.value, now, operatingHours).length > 0
          )
        : [],
    [advanceConfig, now, operatingHours]
  )
  const timeSlots = useMemo(
    () =>
      advanceConfig.enabled && scheduleDate
        ? generateTimeSlots(advanceConfig, scheduleDate, now, operatingHours)
        : [],
    [advanceConfig, scheduleDate, now, operatingHours]
  )
  const isScheduling = advanceConfig.enabled && scheduleMode === 'scheduled'
  const scheduledDateObj = useMemo(
    () =>
      isScheduling && scheduleDate && scheduleTime
        ? combineDateAndTime(scheduleDate, scheduleTime)
        : null,
    [isScheduling, scheduleDate, scheduleTime]
  )
  const scheduledForISO = scheduledDateObj ? scheduledDateObj.toISOString() : null
  const scheduledForLabel = scheduledDateObj ? formatScheduledFor(scheduledDateObj) : null
  const isScheduleValid = scheduledDateObj
    ? isValidScheduledTime(advanceConfig, scheduledDateObj, now, operatingHours)
    : true

  // Change the scheduled date and snap the time to the first valid slot for that date.
  const handleScheduleDateChange = useCallback(
    (date: string) => {
      setScheduleDate(date)
      const slots = generateTimeSlots(advanceConfig, date, now, operatingHours)
      setScheduleTime(slots[0]?.value ?? '')
    },
    [advanceConfig, now, operatingHours]
  )

  // Use storedOrderTypeId directly so fields load immediately (no wait for order types list)
  const { data: formFields = [], isLoading: isFieldsLoading } = useFormFields(storedOrderTypeId || undefined)
  const { data: paymentMethods = [] } = usePaymentMethods(tenant?.id, storedOrderTypeId || undefined)

  useEffect(() => {
    if (isHydrated && !storedOrderTypeId && !isCompletingCheckoutRef.current && !isSubmitting) {
      router.replace('/(main)/home')
    }
  }, [isHydrated, storedOrderTypeId, isSubmitting])

  // Advance order: refresh "now" each minute so the lead-time cutoff stays accurate.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Advance order: default the "When?" choice whenever the selected order type changes.
  // Schedule-only types (ASAP disabled) start in scheduled mode; others default to ASAP.
  useEffect(() => {
    if (!advanceConfig.enabled) {
      setScheduleMode('asap')
      return
    }
    setScheduleMode(advanceConfig.allowAsap ? 'asap' : 'scheduled')
  }, [storedOrderTypeId, advanceConfig.enabled, advanceConfig.allowAsap])

  // Advance order: seed a sensible default slot on entering scheduled mode, and keep the
  // selection valid as time passes or the order type changes. Re-seeds when the chosen date
  // is missing, has gone stale (e.g. crossed midnight), or falls outside the order type's
  // (possibly shrunk) horizon; otherwise just snaps the time to a valid slot for that date.
  useEffect(() => {
    if (!advanceConfig.enabled || scheduleMode !== 'scheduled') return
    const dates = generateScheduleDates(advanceConfig, now, operatingHours)
    const dateValid = !!scheduleDate && dates.some((d) => d.value === scheduleDate)
    const slots = dateValid ? generateTimeSlots(advanceConfig, scheduleDate, now, operatingHours) : []
    if (!dateValid || slots.length === 0) {
      const first = getFirstAvailableSlot(advanceConfig, now, operatingHours)
      setScheduleDate(first?.dateValue ?? '')
      setScheduleTime(first?.timeValue ?? '')
      return
    }
    if (!scheduleTime || !slots.some((s) => s.value === scheduleTime)) {
      setScheduleTime(slots[0].value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scheduleMode,
    scheduleDate,
    advanceConfig.enabled,
    advanceConfig.maxDaysAhead,
    advanceConfig.leadTimeMinutes,
    advanceConfig.slotIntervalMinutes,
    now,
    operatingHours,
  ])

  const hideCurrencySymbol = tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol
  const customerLookup = useMemo(
    () => (tenant?.id ? resolveCustomerLookup(tenant.id, formValues) : null),
    [tenant?.id, formValues]
  )
  const existingCustomerHistory = customerLookup?.customerKey
    ? (historyByKey[customerLookup.customerKey] || null)
    : null
  const pastOrderCount = existingCustomerHistory?.totalOrders || 0

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {}
    formFields.forEach((field: CustomerFormField) => {
      if (field.is_required && !formValues[field.field_name]?.trim()) {
        errors[field.field_name] = `${field.field_label} is required`
      }
      if (field.field_type === 'email' && formValues[field.field_name]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formValues[field.field_name])) {
          errors[field.field_name] = 'Invalid email address'
        }
      }
    })
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [formFields, formValues])

  const handleNextToPayment = useCallback(() => {
    if (validateForm()) {
      setStep(2)
    }
  }, [validateForm])

  const handlePickProof = useCallback(async () => {
    if (!isImageKitConfigured()) {
      Alert.alert('Unavailable', 'Screenshot upload is not configured for this app.')
      return
    }
    setIsUploadingProof(true)
    try {
      const uploaded = await pickAndUploadPaymentProof()
      if (uploaded) {
        // Replace-cleanup: delete the previous screenshot before storing the new one.
        if (paymentProofPublicId && paymentProofPublicId !== uploaded.fileId) {
          deletePaymentProof(paymentProofPublicId, paymentProofFilePath)
        }
        setPaymentProofUrl(uploaded.url)
        setPaymentProofPublicId(uploaded.fileId)
        setPaymentProofFilePath(uploaded.filePath)
      }
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setIsUploadingProof(false)
    }
  }, [paymentProofPublicId, paymentProofFilePath])

  const handleRemoveProof = useCallback(() => {
    if (paymentProofPublicId) deletePaymentProof(paymentProofPublicId, paymentProofFilePath)
    setPaymentProofUrl('')
    setPaymentProofPublicId('')
    setPaymentProofFilePath('')
  }, [paymentProofPublicId, paymentProofFilePath])

  const handleSubmitOrder = useCallback(async () => {
    if (!tenant || !selectedOrderType) return
    if (!selectedPaymentMethod && paymentMethods.length > 0) {
      Alert.alert('Payment Required', 'Please select a payment method.')
      return
    }

    // Enforce per-method payment-proof requirement (screenshot OR reference).
    const proofError = getPaymentProofError(selectedPaymentMethod, {
      screenshotUrl: paymentProofUrl,
      reference: paymentProofReference,
    })
    if (proofError) {
      Alert.alert('Payment Proof Required', proofError)
      return
    }

    // Advance order: schedule-only order types (ASAP disabled) must be scheduled.
    if (advanceConfig.enabled && !advanceConfig.allowAsap && scheduleMode !== 'scheduled') {
      Alert.alert('Scheduling required', 'This order type must be scheduled for a later time.')
      return
    }

    // Advance order: when scheduling is required (or chosen), enforce a valid slot.
    if (advanceConfig.enabled && scheduleMode === 'scheduled') {
      if (!scheduledForISO || !isScheduleValid) {
        Alert.alert(
          'Pick a time',
          'Please select a valid date and time for your scheduled order before placing it.'
        )
        return
      }
    }

    setIsSubmitting(true)

    try {
      let orderId: string | null = null

      // Create order in Convex (if tenant has Convex configured) or Supabase
      if (tenant.convex_deployment_url) {
        // Write to Convex via HTTP API
        const convexResponse = await fetch(`${tenant.convex_deployment_url}/api/mutation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: 'orders:createOrder',
            args: {
              customerName: formValues.customer_name || null,
              customerContact: formValues.customer_phone || formValues.customer_email || null,
              customerData: {
                ...formValues,
                ...(scheduledForISO
                  ? { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' }
                  : {}),
                ...((paymentProofUrl || paymentProofReference)
                  ? {
                      payment_proof_url: paymentProofUrl || undefined,
                      payment_proof_public_id: paymentProofPublicId || undefined,
                      payment_proof_reference: paymentProofReference || undefined,
                    }
                  : {}),
              },
              total,
              orderType: selectedOrderType.name,
              orderTypeId: String(selectedOrderType.id),
              source: 'mobile' as const,
              ...(scheduledForISO ? { scheduledFor: scheduledForISO } : {}),
              itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
              paymentMethod: selectedPaymentMethod?.name || null,
              paymentMethodDetails: selectedPaymentMethod?.details || null,
              deliveryFee: null,
              items: items.map((item) => ({
                menuItemId: String(item.menu_item.id),
                menuItemName: item.menu_item.name,
                quantity: item.quantity,
                price: item.menu_item.discounted_price ?? item.menu_item.price,
                subtotal: item.subtotal,
                specialInstructions: item.special_instructions || null,
                variation: item.selected_variations
                  ? Object.values(item.selected_variations).map(o => o.name).join(', ')
                  : item.selected_variation?.name || null,
                addons: item.selected_addons.map((a) => ({
                  name: a.name,
                  price: 0,
                })),
              })),
            },
            format: 'json',
          }),
        })

        const convexResult = await convexResponse.json()
        if (convexResult.status === 'success') {
          orderId = convexResult.value
        } else {
          console.warn('Convex order creation failed, proceeding to Messenger...', convexResult)
        }
      } else if (tenant.enable_order_management) {
        // Existing Supabase flow
        const orderItems = items.map(item => {
          const variationText = item.selected_variations
            ? Object.values(item.selected_variations).map(o => o.name).join(', ')
            : item.selected_variation?.name || null

          return {
            menu_item_id: item.menu_item.id,
            menu_item_name: item.menu_item.name,
            variation: variationText,
            addons: item.selected_addons.map(a => a.name),
            quantity: item.quantity,
            price: item.menu_item.discounted_price ?? item.menu_item.price,
            subtotal: item.subtotal,
            special_instructions: item.special_instructions || null,
          }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase generic DB types resolve to never due to index signature on Tenant
        const ordersTable = supabase().from('orders') as any
        const { data: order, error: orderError } = await ordersTable
          .insert({
            tenant_id: tenant.id,
            order_type_id: selectedOrderType.id,
            order_type: selectedOrderType.name,
            customer_name: formValues.customer_name || null,
            customer_contact: formValues.customer_phone || formValues.customer_email || null,
            customer_data: {
              ...formValues,
              ...(scheduledForISO
                ? { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' }
                : {}),
            },
            total,
            ...(scheduledForISO ? { scheduled_for: scheduledForISO } : {}),
            status: 'pending',
            payment_method_id: selectedPaymentMethod?.id || null,
            payment_method_name: selectedPaymentMethod?.name || null,
            payment_method_details: selectedPaymentMethod?.details || null,
            payment_method_qr_code_url: selectedPaymentMethod?.qr_code_url || null,
            payment_status: 'pending',
            payment_proof_url: paymentProofUrl || null,
            payment_proof_public_id: paymentProofPublicId || null,
            payment_proof_reference: paymentProofReference.trim() || null,
            payment_proof_uploaded_at: (paymentProofUrl || paymentProofReference.trim())
              ? new Date().toISOString()
              : null,
          })
          .select()
          .single()

        if (orderError) {
          console.warn('Order creation failed, proceeding to Messenger...', orderError)
        } else if (order) {
          orderId = (order as { id: string }).id
          const itemsToInsert = orderItems.map(oi => ({
            order_id: orderId!,
            ...oi,
          }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase().from('order_items') as any).insert(itemsToInsert)
        }
      }

      // Generate messenger message and URL (always happens)
      const message = generateMessengerMessage(
        items,
        tenant.name,
        { name: selectedOrderType.name, type: selectedOrderType.type },
        formValues,
        selectedPaymentMethod ? { name: selectedPaymentMethod.name, details: selectedPaymentMethod.details } : null,
        formFields.map(f => ({ field_name: f.field_name, field_label: f.field_label })),
        scheduledForLabel
      )

      const messengerPageId = tenant.messenger_page_id || tenant.messenger_username
      let messengerUrl: string | null = null

      if (tenant.messenger_redirect_mode === 'direct') {
        // Direct mode should still prefer a pre-filled message URL when possible.
        messengerUrl = generateMessengerUrl(messengerPageId, message) || generateMessengerDirectUrl(messengerPageId)
      } else if (orderId) {
        // Use combined URL with ref + text when we have an order ID
        messengerUrl = generateMessengerCombinedUrl(messengerPageId, orderId, message)
      } else {
        // Fallback to text-only URL when no order was created
        messengerUrl = generateMessengerUrl(messengerPageId, message)
      }

      const customerHistoryStore = useCustomerHistoryStore.getState()
      const previousOrderCount = customerHistoryStore.getPastOrderCount(tenant.id, formValues)
      const updatedCustomerHistory = customerHistoryStore.registerOrder({
        tenantId: tenant.id,
        customerData: formValues,
        orderId,
        orderTypeName: selectedOrderType.name,
        paymentMethodName: selectedPaymentMethod?.name || null,
        total,
      })
      const isCustomerHistoryTracked = !!updatedCustomerHistory
      const totalOrderCount = updatedCustomerHistory?.totalOrders || 0

      // Save completed order data for the confirmation screen
      useOrderStore.getState().setCompletedOrder({
        items: [...items],
        total,
        customerData: { ...formValues },
        formFields: formFields.map(f => ({ field_name: f.field_name, field_label: f.field_label })),
        isCustomerHistoryTracked,
        previousOrderCount,
        totalOrderCount,
        orderTypeName: selectedOrderType.name,
        paymentMethodName: selectedPaymentMethod?.name || null,
        paymentMethodDetails: selectedPaymentMethod?.details || null,
        messengerMessage: message,
        messengerUrl: messengerUrl || '',
        orderId,
        scheduledForLabel,
      })

      // Fire-and-forget: sync order to Google Sheets
      postOrderToSheets({
        tenantId: tenant.id,
        tenantName: tenant.name,
        orderId: orderId || 'ORD-' + Date.now(),
        orderTypeName: selectedOrderType.name,
        customerData: formValues,
        isCustomerHistoryTracked,
        previousOrderCount,
        totalOrderCount,
        total,
        paymentMethodName: selectedPaymentMethod?.name || null,
        paymentMethodDetails: selectedPaymentMethod
          ? { name: selectedPaymentMethod.name, details: selectedPaymentMethod.details }
          : null,
        items,
      })

      isCompletingCheckoutRef.current = true
      clearCart({ resetOrderType: false })

      router.replace('/(main)/order-confirmation')
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.')
      console.error('Checkout error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [
    tenant,
    selectedOrderType,
    selectedPaymentMethod,
    paymentMethods.length,
    items,
    total,
    formValues,
    formFields,
    clearCart,
    paymentProofUrl,
    paymentProofPublicId,
    paymentProofReference,
    advanceConfig.enabled,
    scheduleMode,
    scheduledForISO,
    scheduledForLabel,
    isScheduleValid,
  ])

  // Wait for cart store hydration so order type state is available
  if (!isHydrated || !isCustomerHistoryHydrated) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.checkoutModalBackground }]}>
        <ActivityIndicator size="large" color={theme.checkoutModalButton} />
        <Text style={[{ color: theme.checkoutModalDescription, marginTop: 12, fontSize: 14 }]}>
          Loading checkout...
        </Text>
      </View>
    )
  }

  // Prevent infinite loading when order type has been cleared after checkout
  if (!storedOrderTypeId && !isCompletingCheckoutRef.current && !isSubmitting) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.checkoutModalBackground }]}>
        <ActivityIndicator size="large" color={theme.checkoutModalButton} />
        <Text style={[{ color: theme.checkoutModalDescription, marginTop: 12, fontSize: 14 }]}>
          Redirecting to home...
        </Text>
      </View>
    )
  }

  // Advance-order scheduler, rendered in Step 1 after the form. Gated by the order type's
  // advance_order_enabled flag (the component itself also no-ops when disabled).
  const schedulerEl = selectedOrderType?.advance_order_enabled ? (
    <AdvanceOrderScheduler
      config={advanceConfig}
      scheduleMode={scheduleMode}
      onChangeMode={setScheduleMode}
      scheduleDates={scheduleDates}
      timeSlots={timeSlots}
      scheduleDate={scheduleDate}
      scheduleTime={scheduleTime}
      onChangeDate={handleScheduleDateChange}
      onChangeTime={setScheduleTime}
      scheduledForLabel={scheduledForLabel}
      orderTypeKind={selectedOrderType.type}
    />
  ) : null

  return (
    <View style={[styles.container, { backgroundColor: theme.checkoutModalBackground }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Step indicator — 2 steps now */}
        <View style={styles.steps}>
          {[1, 2].map(s => (
            <View
              key={s}
              style={[
                styles.stepDot,
                {
                  backgroundColor: s <= step ? theme.checkoutModalButton : theme.checkoutModalBorder,
                },
              ]}
            />
          ))}
        </View>

        {step === 1 ? (
          isFieldsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.checkoutModalButton} />
            </View>
          ) : formFields.length === 0 ? (
            <View style={styles.emptyFields}>
              <Text style={[styles.sectionTitle, { color: theme.checkoutModalTitle, textAlign: 'center' }]}>
                No additional details needed
              </Text>
              {schedulerEl}
              <View style={styles.navButtons}>
                <Button title="Continue to Payment" onPress={() => setStep(2)} style={{ flex: 1 }} checkoutVariant />
              </View>
            </View>
          ) : (
            <View>
              <DynamicForm
                fields={formFields}
                values={formValues}
                errors={formErrors}
                onChangeValue={(name, value) =>
                  setFormValues(prev => ({ ...prev, [name]: value }))
                }
                checkoutTheme
              />
              {customerLookup?.customerKey ? (
                <View style={[styles.customerHistoryCard, { backgroundColor: theme.cards, borderColor: theme.border }]}>
                  <Text style={[styles.customerHistoryTitle, { color: theme.textSecondary }]}>
                    Customer History
                  </Text>
                  <Text style={[styles.customerHistoryValue, { color: theme.textPrimary }]}>
                    {pastOrderCount > 0
                      ? `${pastOrderCount} past order${pastOrderCount === 1 ? '' : 's'} on this phone`
                      : 'No past orders for this customer on this phone yet'}
                  </Text>
                </View>
              ) : null}
              {schedulerEl}
              <View style={styles.navButtons}>
                <Button title="Continue" onPress={handleNextToPayment} style={{ flex: 1 }} checkoutVariant />
              </View>
            </View>
          )
        ) : null}

        {step === 2 ? (
          <View style={styles.paymentSection}>
            <Text style={[styles.sectionTitle, { color: theme.checkoutModalTitle }]}>Payment Method</Text>
            {paymentMethods.map(pm => (
              <PaymentMethodCard
                key={pm.id}
                method={pm}
                isSelected={selectedPaymentMethod?.id === pm.id}
                onSelect={() => setSelectedPaymentMethod(pm)}
                checkoutTheme
              />
            ))}
            {selectedPaymentMethod ? (
              <PaymentProofField
                required={isPaymentProofRequired(selectedPaymentMethod)}
                screenshotUrl={paymentProofUrl}
                reference={paymentProofReference}
                isUploading={isUploadingProof}
                onPickImage={handlePickProof}
                onRemoveImage={handleRemoveProof}
                onReferenceChange={setPaymentProofReference}
              />
            ) : null}
            <CartSummary subtotal={total} hideCurrencySymbol={hideCurrencySymbol || false} useCheckoutTheme />
          </View>
        ) : null}
      </ScrollView>

      {step === 2 ? (
        <View style={[styles.footer, { backgroundColor: theme.checkoutModalBackground, borderTopColor: theme.checkoutModalBorder }]}>
          <View style={styles.navButtons}>
            <Button title="Back" variant="outline" onPress={() => setStep(1)} style={{ flex: 1 }} checkoutVariant />
            <Button
              title="Place Order"
              onPress={handleSubmitOrder}
              isLoading={isSubmitting}
              style={{ flex: 1 }}
              checkoutVariant
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 16, paddingBottom: 120 },
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  customerHistoryCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerHistoryTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  customerHistoryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyFields: { paddingHorizontal: 16, paddingTop: 20 },
  paymentSection: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
  },
})
