'use client'

import { formatPresellDateLabel } from '@/lib/presell/month-grid'

/**
 * Classic checkout design — the original single-column layout, preserved
 * verbatim and wired to the shared useCheckout() hook. This is the default and
 * must remain pixel-identical to the pre-template checkout. The confirmation
 * screen and payment/QR dialogs are rendered by the page shell (shared).
 */

import dynamic from 'next/dynamic'
import { ArrowLeft, MessageCircle, UtensilsCrossed, Package, Truck, CreditCard, Check, Zap, CalendarClock, CalendarDays, Clock, Bike, ShoppingBag, Store, type LucideIcon } from 'lucide-react'
import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import { Button } from '@/components/ui/button'
import { formatLeadTime } from '@/lib/advance-order-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { SmsOptInCheckbox, MinimumOrderNotice, OrderSummaryLines, PaymentMethodList } from './checkout-primitives'
import { CheckoutLoyaltyProgress } from './checkout-loyalty-progress'
import { resolvePlaceOrderLabel } from '@/lib/checkout/checkout-cta'
import {
  applyDeliveryAddressChange,
  phPhoneDigitCount,
  phPhoneDisplayDigits,
  toPhPhoneValue,
  PH_PHONE_MAX_DIGITS,
} from '@/lib/checkout/customer-field-input'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { isDeliveryAddressField } from '@/lib/checkout-field-presets'

const ORDER_TYPE_ICONS: Record<OrderTypeKind, LucideIcon> = {
  dine_in: UtensilsCrossed,
  pickup: Package,
  delivery: Truck,
  grab: Bike,
  foodpanda: ShoppingBag,
  other: Store,
}

import { parseLatLng } from '@/lib/maps/apple/mapkit-address'

const AddressAutocomplete = dynamic(
  () => import('@/components/shared/address-autocomplete').then(mod => ({ default: mod.AddressAutocomplete })),
  {
    loading: () => <input className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Loading address field..." disabled />,
    ssr: false,
  }
)

export function ClassicCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    router, tenant, orderTypes, orderType, setOrderType, selectedOrderTypeData,
    advanceConfig, scheduleMode, setScheduleMode, scheduleDate, scheduleTime, setScheduleTime,
    scheduleDates, timeSlots, scheduledForLabel, handleScheduleDateChange, cartPresellDate,
    formFields, customerData, setCustomerData,
    paymentMethods,
    isProcessing, handleProceedToPayment, messengerEnabled, orderMinimum,
  } = checkout

  if (!tenant) return null

  const palette = getCheckoutPalette(checkout.tenant, checkout.branding)
  const ctaLabel = resolvePlaceOrderLabel(checkout)
  const accentColor = typeof checkout.tenant?.checkout_accent_color === 'string' && checkout.tenant.checkout_accent_color ? checkout.tenant.checkout_accent_color : undefined

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20" style={{ background: palette.background }}>
      <header data-senior-hidden className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-orange-200/30">
        <div className="container mx-auto flex h-20 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="hover:bg-orange-50">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ color: palette.text }}>Checkout</h1>
            <p className="text-sm text-gray-500" style={{ color: palette.mutedText }}>Complete your order</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Order Type + Advance Order Scheduling */}
          {checkout.shouldAskFulfillment && (
            <div className="rounded-2xl bg-white p-4 sm:p-6 md:p-8 shadow-sm" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
              <div className="mb-4 sm:mb-5">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900" style={{ color: palette.text }}>How would you like to receive your order?</h2>
                <p className="text-sm text-gray-500 mt-1" style={{ color: palette.mutedText }}>
                  Choose a fulfillment method{advanceConfig.enabled ? ' and when you want it' : ''}.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {orderTypes.map((ot) => {
                  const isSelected = orderType === ot.id
                  const Icon = ORDER_TYPE_ICONS[ot.type] ?? Package

                  return (
                    <button
                      key={ot.id}
                      type="button"
                      onClick={() => setOrderType(ot.id)}
                      aria-pressed={isSelected}
                      className={`relative flex flex-col items-center justify-start text-center rounded-xl border-2 p-3 sm:p-4 transition-all ${isSelected
                        ? 'border-orange-500 bg-orange-50 shadow-sm'
                        : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/40'
                        }`}
                    >
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <span className={`inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full mb-2 ${isSelected ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                      <span className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 leading-tight">{ot.name}</span>
                      {ot.description && (
                        <span className="hidden sm:block text-[11px] text-gray-500 mt-0.5 line-clamp-2">{ot.description}</span>
                      )}
                      {ot.advance_order_enabled && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                          <CalendarClock className="h-2.5 w-2.5" /> Pre-order
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Advance order: "When would you like it?" */}
              {advanceConfig.enabled && (
                <div data-advance-order className="mt-5 sm:mt-6 border-t border-gray-100 pt-5 sm:pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-orange-500" style={{ color: accentColor }} />
                    <h3 className="text-base sm:text-lg font-bold text-gray-900" style={{ color: palette.text }}>When would you like it?</h3>
                  </div>

                  {cartPresellDate && (
                    <p className="mb-3 rounded-xl border border-orange-100 bg-orange-50/40 p-3 text-sm text-gray-700" style={{ color: palette.text }}>
                      Your cart has a pre-order for <span className="font-semibold">{formatPresellDateLabel(cartPresellDate)}</span>. Pick a pickup time below.
                    </p>
                  )}
                  <div className={`grid gap-2.5 sm:gap-3 ${advanceConfig.allowAsap ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {advanceConfig.allowAsap && (
                      <button
                        type="button"
                        onClick={() => setScheduleMode('asap')}
                        aria-pressed={scheduleMode === 'asap'}
                        className={`flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all ${scheduleMode === 'asap' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'
                          }`}
                      >
                        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${scheduleMode === 'asap' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          <Zap className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-sm text-gray-900" style={{ color: palette.text }}>As soon as possible</span>
                          <span className="block text-xs text-gray-500 mt-0.5" style={{ color: palette.mutedText }}>Prepare my order now</span>
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setScheduleMode('scheduled')}
                      aria-pressed={scheduleMode === 'scheduled'}
                      className={`flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all ${scheduleMode === 'scheduled' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'
                        }`}
                    >
                      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${scheduleMode === 'scheduled' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <CalendarClock className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-sm text-gray-900" style={{ color: palette.text }}>Schedule for later</span>
                        <span className="block text-xs text-gray-500 mt-0.5" style={{ color: palette.mutedText }}>
                          {advanceConfig.allowAsap ? 'Pick a date & time' : 'Advance order required'}
                        </span>
                      </span>
                    </button>
                  </div>

                  {/* Date + time pickers */}
                  {scheduleMode === 'scheduled' && (
                    <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/40 p-3.5 sm:p-4">
                      {scheduleDates.length === 0 ? (
                        <p className="text-sm text-gray-600" style={{ color: palette.mutedText }}>
                          No advance times are available right now — please check back later or contact us.
                        </p>
                      ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5" style={{ color: palette.mutedText }}>
                            <CalendarDays className="h-3.5 w-3.5" /> Date
                          </label>
                          <div className="-mx-1 flex gap-2 overflow-x-auto whitespace-nowrap px-1 pb-1">
                            {scheduleDates.map((d) => {
                              const selected = d.value === scheduleDate
                              return (
                                <button
                                  key={d.value}
                                  type="button"
                                  onClick={() => handleScheduleDateChange(d.value)}
                                  aria-pressed={selected}
                                  className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 ${selected
                                    ? 'border-orange-500 bg-orange-500 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:border-orange-300'}`}
                                >
                                  {d.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5" style={{ color: palette.mutedText }}>
                            <Clock className="h-3.5 w-3.5" /> Time
                          </label>
                          {timeSlots.length === 0 ? (
                            <p className="text-xs text-gray-500" style={{ color: palette.mutedText }}>
                              No more times available for this day — please pick another date.
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {timeSlots.map((s) => {
                                const selected = s.value === scheduleTime
                                return (
                                  <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => setScheduleTime(s.value)}
                                    aria-pressed={selected}
                                    className={`rounded-lg border px-2 py-2 text-center text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 ${selected
                                      ? 'border-orange-500 bg-orange-500 text-white'
                                      : 'border-gray-300 bg-white text-gray-700 hover:border-orange-300'}`}
                                  >
                                    {s.label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      )}

                      {timeSlots.length > 0 && scheduledForLabel ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white border border-orange-200 px-3 py-2.5">
                          <CalendarClock className="h-4 w-4 text-orange-500 shrink-0" style={{ color: accentColor }} />
                          <p className="text-sm text-gray-700" style={{ color: palette.mutedText }}>
                            {selectedOrderTypeData?.type === 'delivery' ? 'Arriving' : 'Ready'}{' '}
                            <span className="font-semibold text-gray-900" style={{ color: palette.text }}>{scheduledForLabel}</span>
                          </p>
                        </div>
                      ) : null}

                      {advanceConfig.leadTimeMinutes > 0 && (
                        <p className="mt-2 text-[11px] text-gray-400" style={{ color: palette.mutedText }}>
                          Orders need at least {formatLeadTime(advanceConfig.leadTimeMinutes)} of advance notice.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Customer Information Form */}
          {orderType && formFields.length > 0 && (
            <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
              <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ color: palette.text }}>Customer Information</h2>
              <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>Please provide the following details</p>

              <div className="grid gap-4 md:grid-cols-2">
                {formFields.map((field) => (
                  <div key={field.id} className={field.field_type === 'textarea' || isDeliveryAddressField(field) ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-2" style={{ color: palette.mutedText }}>
                      {field.field_label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {/* Special handling for delivery address with map-backed autocomplete */}
                    {isDeliveryAddressField(field) ? (
                      <AddressAutocomplete
                        value={customerData[field.field_name] || ''}
                        coordinates={parseLatLng(customerData.delivery_lat, customerData.delivery_lng)}
                        onChange={(address, coordinates) => {
                          setCustomerData(prev => applyDeliveryAddressChange(prev, field.field_name, address, coordinates))
                        }}
                        placeholder={field.placeholder || 'Start typing your address...'}
                        required={field.is_required}
                        mapsEnabled={tenant?.mapbox_enabled ?? true}
                      />
                    ) : field.field_type === 'textarea' ? (
                      <textarea
                        value={customerData[field.field_name] || ''}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        rows={3}
                      />
                    ) : field.field_type === 'select' ? (
                      <select
                        value={customerData[field.field_name] || ''}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Select {field.field_label}</option>
                        {field.options?.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.field_type === 'phone' && (tenant?.lalamove_market || '').toUpperCase() === 'PH' ? (
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 font-medium pointer-events-none">
                          +63
                        </div>
                        <input
                          type="tel"
                          value={phPhoneDisplayDigits(customerData[field.field_name] || '')}
                          onChange={(e) => {
                            // Digits only, no leading 0, at most 10, stored with +63.
                            const stored = toPhPhoneValue(e.target.value)
                            setCustomerData(prev => ({ ...prev, [field.field_name]: stored }))
                          }}
                          placeholder="9XXXXXXXXX"
                          maxLength={PH_PHONE_MAX_DIGITS}
                          className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                          {`${phPhoneDigitCount(customerData[field.field_name] || '')}/${PH_PHONE_MAX_DIGITS}`}
                        </div>
                      </div>
                    ) : (
                      <input
                        type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
                        value={customerData[field.field_name] || ''}
                        onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    )}
                  </div>
                ))}
              </div>
              {/* Classic renders its own fields rather than composing
                  CheckoutFields, so the consent box and the loyalty card have
                  to be added here explicitly — it is the one design that can
                  silently miss them. */}
              <div className="mt-4">
                <CheckoutLoyaltyProgress checkout={checkout} />
              </div>
              <SmsOptInCheckbox checkout={checkout} />
            </div>
          )}

          <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ backgroundColor: palette.summaryBackground, borderColor: palette.border }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ color: palette.text }}>Order Summary</h2>
            <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>Review your order before checkout</p>

            <OrderSummaryLines checkout={checkout} variant="classic" />
          </div>

          {/* Payment method: the shared wallet-style picker (branded). */}
          {(paymentMethods.length > 0 || (orderType && tenant)) && (
            <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
              <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ color: palette.text }}>Payment</h2>
              <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>
                Choose how you would like to pay
              </p>
              <PaymentMethodList checkout={checkout} />
            </div>
          )}

          <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3" style={{ color: palette.text }}>
              <MessageCircle className="h-6 w-6 text-orange-500" style={{ color: accentColor }} />
              {paymentMethods.length > 0 || !messengerEnabled ? 'Complete Order' : 'Complete Order via Messenger'}
            </h2>
            <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>
              {paymentMethods.length > 0
                ? `After selecting your payment method, click below to complete your order with ${tenant.name}.`
                : messengerEnabled
                  ? `Click the button below to send your order to ${tenant.name} via Facebook Messenger. You'll be redirected to Messenger with your order details pre-filled.`
                  : `Click the button below to send your order to ${tenant.name}.`
              }
            </p>

            <MinimumOrderNotice checkout={checkout} className="mb-3 text-center" />

            <Button
              size="lg"
              className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: palette.button, color: palette.button ? palette.accentText : undefined }}
              onClick={handleProceedToPayment}
              disabled={isProcessing || orderMinimum?.meets === false}
            >
              {isProcessing ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  Processing Order...
                </>
              ) : paymentMethods.length > 0 ? (
                <>
                  <CreditCard className="mr-3 h-6 w-6" />
                  {ctaLabel}
                </>
              ) : (
                <>
                  {messengerEnabled ? <MessageCircle className="mr-3 h-6 w-6" /> : <Check className="mr-3 h-6 w-6" />}
                  {ctaLabel}
                </>
              )}
            </Button>

            <p className="text-center text-sm text-gray-500 mt-4" style={{ color: palette.mutedText }}>
              Your order will be sent to the restaurant for confirmation
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
