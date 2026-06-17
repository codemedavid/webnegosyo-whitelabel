'use client'

/**
 * Classic checkout design — the original single-column layout, preserved
 * verbatim and wired to the shared useCheckout() hook. This is the default and
 * must remain pixel-identical to the pre-template checkout. The confirmation
 * screen and payment/QR dialogs are rendered by the page shell (shared).
 */

import dynamic from 'next/dynamic'
import { ArrowLeft, MessageCircle, UtensilsCrossed, Package, Truck, CreditCard, QrCode, Copy, Check, Zap, CalendarClock, CalendarDays, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import { formatLeadTime } from '@/lib/advance-order-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const MapboxAddressAutocomplete = dynamic(
  () => import('@/components/shared/mapbox-address-autocomplete').then(mod => ({ default: mod.MapboxAddressAutocomplete })),
  {
    loading: () => <input className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Loading address field..." disabled />,
    ssr: false,
  }
)

export function ClassicCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    router, tenant, orderTypes, orderType, setOrderType, selectedOrderTypeData,
    advanceConfig, scheduleMode, setScheduleMode, scheduleDate, scheduleTime, setScheduleTime,
    scheduleDates, timeSlots, scheduledForLabel, handleScheduleDateChange,
    formFields, customerData, setCustomerData,
    items, total, deliveryFee, isFetchingDeliveryFee, deliveryFeeAddress, serviceChargeAmount,
    paymentMethods, selectedPaymentMethod, setSelectedPaymentMethod, openQrDialog, handleCopyText, copiedText,
    isProcessing, handleProceedToPayment,
  } = checkout

  if (!tenant) return null

  const palette = getCheckoutPalette(checkout.tenant, checkout.branding)
  const accentColor = typeof checkout.tenant?.checkout_accent_color === 'string' && checkout.tenant.checkout_accent_color ? checkout.tenant.checkout_accent_color : undefined

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20" style={{ background: palette.background }}>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-orange-200/30">
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
          {orderTypes.length > 0 && (
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
                  const iconMap = {
                    dine_in: UtensilsCrossed,
                    pickup: Package,
                    delivery: Truck,
                  }
                  const Icon = iconMap[ot.type] ?? Package

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
                  <div key={field.id} className={field.field_type === 'textarea' || field.field_name === 'delivery_address' ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-2" style={{ color: palette.mutedText }}>
                      {field.field_label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {/* Special handling for delivery address with Mapbox Autocomplete */}
                    {field.field_name === 'delivery_address' ? (
                      <MapboxAddressAutocomplete
                        value={customerData[field.field_name] || ''}
                        onChange={(address, coordinates) => {
                          setCustomerData(prev => {
                            const next = { ...prev, [field.field_name]: address }
                            if (coordinates) {
                              next.delivery_lat = String(coordinates.lat)
                              next.delivery_lng = String(coordinates.lng)
                            } else {
                              // Free-text edit without a fresh geocode: drop stale coords so the
                              // fee path treats this as "no coordinates" and forces re-selection.
                              delete next.delivery_lat
                              delete next.delivery_lng
                            }
                            return next
                          })
                        }}
                        placeholder={field.placeholder || 'Start typing your address...'}
                        required={field.is_required}
                        mapboxEnabled={tenant?.mapbox_enabled ?? true}
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
                          value={(() => {
                            const value = customerData[field.field_name] || ''
                            // Remove +63 prefix if present to show only the number part
                            if (value.startsWith('+63')) {
                              return value.slice(3).replace(/\D/g, '')
                            }
                            // Remove + if present
                            if (value.startsWith('+')) {
                              return value.slice(1).replace(/\D/g, '')
                            }
                            // Remove leading 0 if present
                            if (value.startsWith('0')) {
                              return value.slice(1).replace(/\D/g, '')
                            }
                            return value.replace(/\D/g, '')
                          })()}
                          onChange={(e) => {
                            let inputValue = e.target.value.replace(/\D/g, '') // Only digits

                            // Prevent 0 as the first digit
                            if (inputValue.startsWith('0')) {
                              inputValue = inputValue.slice(1)
                            }

                            // Limit to 10 digits (standard PH mobile number length)
                            if (inputValue.length > 10) {
                              inputValue = inputValue.slice(0, 10)
                            }

                            // Store with +63 prefix
                            setCustomerData(prev => ({
                              ...prev,
                              [field.field_name]: inputValue ? `+63${inputValue}` : ''
                            }))
                          }}
                          placeholder="9XXXXXXXXX"
                          maxLength={10}
                          className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                          {(() => {
                            const value = customerData[field.field_name] || ''
                            const digits = value.replace(/\D/g, '').replace(/^63/, '').replace(/^0/, '')
                            return `${digits.length}/10`
                          })()}
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
            </div>
          )}

          <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ backgroundColor: palette.summaryBackground, borderColor: palette.border }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ color: palette.text }}>Order Summary</h2>
            <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>Review your order before checkout</p>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <Separator className="my-4" />}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <div className="flex-1 mr-4">
                        <span className="font-medium">{item.menu_item.name}</span>

                        {/* Legacy single variation */}
                        {item.selected_variation && (
                          <span className="text-sm text-muted-foreground">
                            {' '}
                            ({item.selected_variation.name})
                          </span>
                        )}

                        {/* New grouped variations */}
                        {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {' '}
                            ({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                          </span>
                        )}

                        <span className="text-sm text-muted-foreground"> x{item.quantity}</span>
                      </div>
                      <span className="font-semibold flex-shrink-0">{formatPrice(item.subtotal)}</span>
                    </div>

                    {item.selected_addons.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Add-ons: {item.selected_addons.map((a) => a.name).join(', ')}
                      </p>
                    )}

                    {item.special_instructions && (
                      <p className="text-sm italic text-muted-foreground">
                        Note: {item.special_instructions}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              <Separator className="my-4" />

              {/* Delivery Fee */}
              {(deliveryFee !== null || isFetchingDeliveryFee) && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600" style={{ color: palette.mutedText }}>
                      Delivery Fee
                    </span>
                    <span className="font-semibold" style={{ color: palette.text }}>
                      {isFetchingDeliveryFee ? (
                        <span className="text-orange-500 animate-pulse" style={{ color: accentColor }}>Calculating...</span>
                      ) : (deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address) ? (
                        formatPrice(deliveryFee)
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}

              {/* Service Charge */}
              {serviceChargeAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600" style={{ color: palette.mutedText }}>Service Charge</span>
                    <span className="font-semibold" style={{ color: palette.text }}>{formatPrice(serviceChargeAmount)}</span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}

              <div className="flex justify-between text-xl font-bold pt-4 border-t">
                <span style={{ color: palette.text }}>Total</span>
                <span className="text-orange-600" style={{ color: accentColor }}>
                  {isFetchingDeliveryFee ? (
                    <span className="animate-pulse">Calculating...</span>
                  ) : (
                    formatPrice(total + ((deliveryFee && deliveryFeeAddress === customerData.delivery_address) ? deliveryFee : 0) + serviceChargeAmount)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          {paymentMethods.length > 0 ? (
            <div className="rounded-2xl bg-white p-8 shadow-sm" data-payment-methods style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3" style={{ color: palette.text }}>
                <CreditCard className="h-6 w-6 text-orange-500" style={{ color: accentColor }} />
                Select Payment Method
                <Badge variant="outline" className="ml-auto bg-red-50 text-red-700 border-red-300">
                  Required
                </Badge>
              </h2>
              <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>
                Choose how you would like to pay for your order
              </p>

              <div className="space-y-3">
                {paymentMethods.map((method) => {
                  const isSelected = selectedPaymentMethod === method.id

                  return (
                    <label
                      key={method.id}
                      className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-orange-300 hover:bg-orange-50/50 ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200'
                        }`}
                      onClick={() => setSelectedPaymentMethod(method.id)}
                    >
                      {/* Radio Button */}
                      <div className="flex items-center h-6 mt-0.5">
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setSelectedPaymentMethod(method.id)}
                          className="w-4 h-4 text-orange-600 focus:ring-orange-500 focus:ring-2"
                        />
                      </div>

                      {/* QR Code Thumbnail */}
                      {method.qr_code_url && (
                        <div
                          className="shrink-0 cursor-pointer hover:opacity-80"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (method.qr_code_url) {
                              openQrDialog(method.qr_code_url)
                            }
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={method.qr_code_url}
                            alt={`${method.name} QR Code`}
                            className="w-12 h-12 object-cover rounded border"
                          />
                          <div className="text-xs text-gray-500 text-center mt-1 flex items-center justify-center gap-1">
                            <QrCode className="h-3 w-3" />
                          </div>
                        </div>
                      )}

                      {/* Payment Method Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base mb-1" style={{ color: palette.text }}>{method.name}</h3>
                        {method.details && (
                          <p className="text-sm text-gray-600 line-clamp-2" style={{ color: palette.mutedText }}>
                            {method.details}
                          </p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Selected Payment Method Details */}
              {selectedPaymentMethod && (
                <div className="mt-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CreditCard className="h-5 w-5 text-orange-600 mt-0.5" style={{ color: accentColor }} />
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-900 mb-2" style={{ color: accentColor }}>Selected Payment Method</h3>
                      <p className="font-medium text-gray-900 mb-2" style={{ color: palette.text }}>
                        {paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}
                      </p>
                      {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details && (
                        <div className="bg-white p-3 rounded border border-orange-200">
                          <p className="text-sm font-medium text-gray-700 mb-2" style={{ color: palette.mutedText }}>Payment Details:</p>
                          <div className="space-y-2">
                            {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details?.split('\n').map((line, index) => {
                              const trimmedLine = line.trim()
                              if (!trimmedLine) return null
                              return (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => handleCopyText(trimmedLine, 'Details')}
                                  className="w-full flex items-center justify-between gap-2 p-2 rounded-md bg-gray-50 hover:bg-orange-100 transition-colors text-left group"
                                >
                                  <span className="text-sm text-gray-700 break-all" style={{ color: palette.text }}>{trimmedLine}</span>
                                  {copiedText === trimmedLine ? (
                                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                                  ) : (
                                    <Copy className="h-4 w-4 text-gray-400 group-hover:text-orange-500 shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1" style={{ color: palette.mutedText }}>
                            <Copy className="h-3 w-3" /> Tap on any line to copy
                          </p>
                        </div>
                      )}
                      {(() => {
                        const qrUrl = paymentMethods.find(m => m.id === selectedPaymentMethod)?.qr_code_url
                        if (!qrUrl) return null

                        return (
                          <div className="mt-3 flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={qrUrl}
                              alt="Payment QR Code"
                              className="w-32 h-32 object-contain border-2 border-orange-300 rounded-lg bg-white p-2 cursor-pointer hover:opacity-80"
                              onClick={() => openQrDialog(qrUrl)}
                            />
                            <div className="flex-1">
                              <p className="text-sm text-gray-600 mb-2" style={{ color: palette.mutedText }}>Scan this QR code to complete payment</p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openQrDialog(qrUrl)}
                                className="border-orange-300 text-orange-700 hover:bg-orange-100"
                              >
                                <QrCode className="h-4 w-4 mr-2" />
                                View Full Size
                              </Button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : orderType && tenant ? (
            <div className="rounded-2xl bg-yellow-50 border-2 border-yellow-200 p-6">
              <div className="flex items-start gap-3">
                <div className="text-yellow-600 mt-1">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900 mb-1">No Payment Methods Available</h3>
                  <p className="text-sm text-yellow-800">
                    No payment methods have been set up for this order type yet. You can still proceed with your order, and payment details will be discussed via Messenger.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ backgroundColor: palette.cardBackground, borderColor: palette.border }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3" style={{ color: palette.text }}>
              <MessageCircle className="h-6 w-6 text-orange-500" style={{ color: accentColor }} />
              {paymentMethods.length > 0 ? 'Complete Order' : 'Complete Order via Messenger'}
            </h2>
            <p className="text-gray-600 mb-6" style={{ color: palette.mutedText }}>
              {paymentMethods.length > 0
                ? `After selecting your payment method, click below to complete your order with ${tenant.name}.`
                : `Click the button below to send your order to ${tenant.name} via Facebook Messenger. You'll be redirected to Messenger with your order details pre-filled.`
              }
            </p>

            <Button
              size="lg"
              className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: palette.button, color: palette.button ? palette.accentText : undefined }}
              onClick={handleProceedToPayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  Processing Order...
                </>
              ) : paymentMethods.length > 0 ? (
                <>
                  <CreditCard className="mr-3 h-6 w-6" />
                  Proceed to Payment
                </>
              ) : (
                <>
                  <MessageCircle className="mr-3 h-6 w-6" />
                  Send Order via Messenger
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
