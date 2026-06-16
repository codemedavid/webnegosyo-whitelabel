'use client'

/**
 * Branding-aware checkout building blocks.
 *
 * The four modern checkout designs (modern / wizard / minimal / express)
 * compose these primitives instead of re-implementing the genuinely tricky,
 * bug-prone pieces (Mapbox autocomplete, PH phone normalization, payment QR
 * wiring, advance-order slot selection). Each primitive consumes the shared
 * useCheckout() hook and themes itself from `checkout.branding`, so designs get
 * tenant colors for free. Layout/chrome is left to each design.
 *
 * The Classic design intentionally does NOT use these — it preserves the
 * original orange markup verbatim.
 */

import { useId } from 'react'
import dynamic from 'next/dynamic'
import {
  UtensilsCrossed, Package, Truck, Check, Clock, Zap, CalendarClock, CalendarDays, QrCode, Copy, CreditCard,
} from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { formatLeadTime } from '@/lib/advance-order-utils'
import { setAlpha, getContrastColor } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const MapboxAddressAutocomplete = dynamic(
  () => import('@/components/shared/mapbox-address-autocomplete').then(mod => ({ default: mod.MapboxAddressAutocomplete })),
  {
    loading: () => <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Loading address field..." disabled />,
    ssr: false,
  }
)

const orderTypeIconMap = {
  dine_in: UtensilsCrossed,
  pickup: Package,
  delivery: Truck,
} as const

/** Themed accent values derived from tenant branding. */
function useAccent(checkout: UseCheckoutReturn) {
  const accent = checkout.branding.buttonPrimary || checkout.branding.primary || '#111111'
  return {
    accent,
    accentText: getContrastColor(accent),
    accentSoft: setAlpha(accent, 0.08),
    accentSofter: setAlpha(accent, 0.04),
    accentBorder: setAlpha(accent, 0.45),
  }
}

/**
 * Customer information inputs. Owns ALL the field-type logic
 * (Mapbox / PH phone / textarea / select / text) in one place.
 * `columns` controls the desktop grid; address & textarea always span full width.
 */
export function CheckoutFields({ checkout, columns = 2 }: { checkout: UseCheckoutReturn; columns?: 1 | 2 }) {
  const { formFields, customerData, setCustomerData, tenant } = checkout
  const { accent } = useAccent(checkout)
  const reactId = useId()

  if (!formFields.length) return null

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[color:var(--checkout-accent)] focus:border-[color:var(--checkout-accent)] transition-shadow'

  return (
    <div
      className={`grid gap-4 ${columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}
      style={{ ['--checkout-accent' as string]: accent }}
    >
      {formFields.map((field) => {
        const fieldId = `${reactId}-${field.id}`
        const fullWidth = field.field_type === 'textarea' || field.field_name === 'delivery_address'
        return (
          <div key={field.id} className={fullWidth && columns === 2 ? 'md:col-span-2' : ''}>
            <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1.5">
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {field.field_name === 'delivery_address' ? (
              <MapboxAddressAutocomplete
                value={customerData[field.field_name] || ''}
                onChange={(address, coordinates) => {
                  setCustomerData(prev => ({
                    ...prev,
                    [field.field_name]: address,
                    ...(coordinates && {
                      delivery_lat: String(coordinates.lat),
                      delivery_lng: String(coordinates.lng),
                    }),
                  }))
                }}
                placeholder={field.placeholder || 'Start typing your address...'}
                required={field.is_required}
                mapboxEnabled={tenant?.mapbox_enabled ?? true}
              />
            ) : field.field_type === 'textarea' ? (
              <textarea
                id={fieldId}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                placeholder={field.placeholder}
                className={inputClass}
                rows={3}
              />
            ) : field.field_type === 'select' ? (
              <select
                id={fieldId}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                className={inputClass}
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
                  id={fieldId}
                  type="tel"
                  value={(() => {
                    const value = customerData[field.field_name] || ''
                    if (value.startsWith('+63')) return value.slice(3).replace(/\D/g, '')
                    if (value.startsWith('+')) return value.slice(1).replace(/\D/g, '')
                    if (value.startsWith('0')) return value.slice(1).replace(/\D/g, '')
                    return value.replace(/\D/g, '')
                  })()}
                  onChange={(e) => {
                    let inputValue = e.target.value.replace(/\D/g, '')
                    if (inputValue.startsWith('0')) inputValue = inputValue.slice(1)
                    if (inputValue.length > 10) inputValue = inputValue.slice(0, 10)
                    setCustomerData(prev => ({
                      ...prev,
                      [field.field_name]: inputValue ? `+63${inputValue}` : '',
                    }))
                  }}
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                  className={`${inputClass} pl-12`}
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
                id={fieldId}
                type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                placeholder={field.placeholder}
                className={inputClass}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Order-type selector (dine-in / pickup / delivery). Branded card buttons.
 * `compact` renders smaller cards for tight layouts (express).
 */
export function OrderTypeSelector({ checkout, compact = false }: { checkout: UseCheckoutReturn; compact?: boolean }) {
  const { orderTypes, orderType, setOrderType } = checkout
  const { accent, accentText, accentSoft, accentBorder } = useAccent(checkout)

  if (!orderTypes.length) return null

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {orderTypes.map((ot) => {
        const isSelected = orderType === ot.id
        const Icon = orderTypeIconMap[ot.type] ?? Package
        return (
          <button
            key={ot.id}
            type="button"
            onClick={() => setOrderType(ot.id)}
            aria-pressed={isSelected}
            className={`relative flex flex-col items-center justify-start text-center rounded-2xl border-2 transition-all ${compact ? 'p-2.5' : 'p-3 sm:p-4'} ${isSelected ? 'shadow-sm' : 'hover:shadow-sm'}`}
            style={{
              borderColor: isSelected ? accent : '#e5e7eb',
              backgroundColor: isSelected ? accentSoft : '#ffffff',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = accentBorder }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#e5e7eb' }}
          >
            {isSelected && (
              <span
                className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: accent, color: accentText }}
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            <span
              className={`inline-flex items-center justify-center rounded-full mb-2 ${compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-12 sm:w-12'}`}
              style={isSelected ? { backgroundColor: accent, color: accentText } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}
            >
              <Icon className={compact ? 'h-4.5 w-4.5' : 'h-5 w-5 sm:h-6 sm:w-6'} />
            </span>
            <span className="font-semibold text-xs sm:text-sm text-gray-900 leading-tight">{ot.name}</span>
            {!compact && ot.description && (
              <span className="hidden sm:block text-[11px] text-gray-500 mt-0.5 line-clamp-2">{ot.description}</span>
            )}
            {ot.advance_order_enabled && (
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: accentSoft, color: accent }}
              >
                <CalendarClock className="h-2.5 w-2.5" /> Pre-order
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Advance-order "When would you like it?" scheduler (branded). */
export function AdvanceOrderScheduler({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    advanceConfig, scheduleMode, setScheduleMode, scheduleDate, scheduleTime, setScheduleTime,
    scheduleDates, timeSlots, scheduledForLabel, selectedOrderTypeData, handleScheduleDateChange,
  } = checkout
  const { accent, accentText, accentSoft } = useAccent(checkout)

  if (!advanceConfig.enabled) return null

  const modeButton = (mode: 'asap' | 'scheduled', icon: React.ReactNode, title: string, subtitle: string) => {
    const active = scheduleMode === mode
    return (
      <button
        type="button"
        onClick={() => setScheduleMode(mode)}
        aria-pressed={active}
        className="flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all"
        style={{ borderColor: active ? accent : '#e5e7eb', backgroundColor: active ? accentSoft : '#ffffff' }}
      >
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={active ? { backgroundColor: accent, color: accentText } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm text-gray-900">{title}</span>
          <span className="block text-xs text-gray-500 mt-0.5">{subtitle}</span>
        </span>
      </button>
    )
  }

  return (
    <div data-advance-order style={{ ['--checkout-accent' as string]: accent }}>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-5 w-5" style={{ color: accent }} />
        <h3 className="text-base sm:text-lg font-bold text-gray-900">When would you like it?</h3>
      </div>

      <div className={`grid gap-2.5 sm:gap-3 ${advanceConfig.allowAsap ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {advanceConfig.allowAsap && modeButton('asap', <Zap className="h-5 w-5" />, 'As soon as possible', 'Prepare my order now')}
        {modeButton('scheduled', <CalendarClock className="h-5 w-5" />, 'Schedule for later', advanceConfig.allowAsap ? 'Pick a date & time' : 'Advance order required')}
      </div>

      {scheduleMode === 'scheduled' && (
        <div className="mt-4 rounded-xl border p-3.5 sm:p-4" style={{ borderColor: setAlpha(accent, 0.25), backgroundColor: setAlpha(accent, 0.04) }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Date
              </label>
              <select
                value={scheduleDate}
                onChange={(e) => handleScheduleDateChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--checkout-accent)]"
              >
                {scheduleDates.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
                <Clock className="h-3.5 w-3.5" /> Time
              </label>
              <select
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                disabled={timeSlots.length === 0}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--checkout-accent)] disabled:bg-gray-100 disabled:text-gray-400"
              >
                {timeSlots.length === 0 ? (
                  <option value="">No times available</option>
                ) : (
                  timeSlots.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {timeSlots.length > 0 && scheduledForLabel ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white border px-3 py-2.5" style={{ borderColor: setAlpha(accent, 0.3) }}>
              <CalendarClock className="h-4 w-4 shrink-0" style={{ color: accent }} />
              <p className="text-sm text-gray-700">
                {selectedOrderTypeData?.type === 'delivery' ? 'Arriving' : 'Ready'}{' '}
                <span className="font-semibold text-gray-900">{scheduledForLabel}</span>
              </p>
            </div>
          ) : timeSlots.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500">
              No more times available for this day — please pick another date.
            </p>
          ) : null}

          {advanceConfig.leadTimeMinutes > 0 && (
            <p className="mt-2 text-[11px] text-gray-400">
              Orders need at least {formatLeadTime(advanceConfig.leadTimeMinutes)} of advance notice.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Order summary line items + totals (branded). */
export function OrderSummaryLines({ checkout }: { checkout: UseCheckoutReturn }) {
  const { items, total, deliveryFee, isFetchingDeliveryFee, deliveryFeeAddress, customerData, serviceChargeAmount, grandTotal } = checkout
  const { accent } = useAccent(checkout)
  const feeMatches = deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id}>
          {index > 0 && <div className="my-3 border-t border-gray-100" />}
          <div className="flex justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm text-gray-900">{item.menu_item.name}</span>
              {item.selected_variation && (
                <span className="text-xs text-gray-500"> ({item.selected_variation.name})</span>
              )}
              {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                <span className="text-xs text-gray-500">
                  {' '}({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                </span>
              )}
              <span className="text-xs text-gray-500"> x{item.quantity}</span>
              {item.selected_addons.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">Add-ons: {item.selected_addons.map(a => a.name).join(', ')}</p>
              )}
              {item.special_instructions && (
                <p className="text-xs italic text-gray-500 mt-0.5">Note: {item.special_instructions}</p>
              )}
            </div>
            <span className="font-semibold text-sm text-gray-900 flex-shrink-0">{formatPrice(item.subtotal)}</span>
          </div>
        </div>
      ))}

      <div className="my-3 border-t border-gray-100" />

      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Subtotal</span>
        <span className="font-medium text-gray-900">{formatPrice(total)}</span>
      </div>

      {(deliveryFee !== null || isFetchingDeliveryFee) && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Delivery Fee</span>
          <span className="font-medium text-gray-900">
            {isFetchingDeliveryFee ? (
              <span className="animate-pulse" style={{ color: accent }}>Calculating...</span>
            ) : feeMatches ? (
              formatPrice(deliveryFee!)
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </span>
        </div>
      )}

      {serviceChargeAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Service Charge</span>
          <span className="font-medium text-gray-900">{formatPrice(serviceChargeAmount)}</span>
        </div>
      )}

      <div className="my-2 border-t border-gray-200" />

      <div className="flex justify-between items-baseline">
        <span className="text-base font-bold text-gray-900">Total</span>
        <span className="text-xl font-bold" style={{ color: accent }}>
          {isFetchingDeliveryFee ? <span className="animate-pulse">Calculating...</span> : formatPrice(grandTotal)}
        </span>
      </div>
    </div>
  )
}

/** Payment-method selector (radio list + selected details + QR). Branded. */
export function PaymentMethodList({ checkout }: { checkout: UseCheckoutReturn }) {
  const { paymentMethods, selectedPaymentMethod, setSelectedPaymentMethod, openQrDialog, handleCopyText, copiedText, orderType, tenant } = checkout
  const { accent, accentSoft, accentBorder } = useAccent(checkout)

  if (paymentMethods.length === 0) {
    if (orderType && tenant) {
      return (
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
      )
    }
    return null
  }

  return (
    <div className="space-y-3" data-payment-methods>
      {paymentMethods.map((method) => {
        const isSelected = selectedPaymentMethod === method.id
        return (
          <label
            key={method.id}
            className="flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all"
            style={{ borderColor: isSelected ? accent : '#e5e7eb', backgroundColor: isSelected ? accentSoft : '#ffffff' }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = accentBorder }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#e5e7eb' }}
            onClick={() => setSelectedPaymentMethod(method.id)}
          >
            <div className="flex items-center h-6 mt-0.5">
              <input
                type="radio"
                checked={isSelected}
                onChange={() => setSelectedPaymentMethod(method.id)}
                className="w-4 h-4"
                style={{ accentColor: accent }}
              />
            </div>

            {method.qr_code_url && (
              <div
                className="shrink-0 cursor-pointer hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation()
                  if (method.qr_code_url) openQrDialog(method.qr_code_url)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={method.qr_code_url} alt={`${method.name} QR Code`} className="w-12 h-12 object-cover rounded border" />
                <div className="text-xs text-gray-500 text-center mt-1 flex items-center justify-center gap-1">
                  <QrCode className="h-3 w-3" />
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1 text-gray-900">{method.name}</h3>
              {method.details && <p className="text-sm text-gray-600 line-clamp-2">{method.details}</p>}
            </div>
          </label>
        )
      })}

      {selectedPaymentMethod && (
        <div className="mt-4 p-4 rounded-xl border-2" style={{ borderColor: accentBorder, backgroundColor: accentSoft }}>
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 mt-0.5" style={{ color: accent }} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold mb-2 text-gray-900">Selected Payment Method</h3>
              <p className="font-medium text-gray-900 mb-2">
                {paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}
              </p>
              {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details && (
                <div className="bg-white p-3 rounded-lg border" style={{ borderColor: setAlpha(accent, 0.3) }}>
                  <p className="text-sm font-medium text-gray-700 mb-2">Payment Details:</p>
                  <div className="space-y-2">
                    {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details?.split('\n').map((line, index) => {
                      const trimmedLine = line.trim()
                      if (!trimmedLine) return null
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleCopyText(trimmedLine, 'Details')}
                          className="w-full flex items-center justify-between gap-2 p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors text-left group"
                        >
                          <span className="text-sm text-gray-700 break-all">{trimmedLine}</span>
                          {copiedText === trimmedLine ? (
                            <Check className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-400 shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
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
                      className="w-32 h-32 object-contain border-2 rounded-lg bg-white p-2 cursor-pointer hover:opacity-80"
                      style={{ borderColor: setAlpha(accent, 0.4) }}
                      onClick={() => openQrDialog(qrUrl)}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-2">Scan this QR code to complete payment</p>
                      <button
                        type="button"
                        onClick={() => openQrDialog(qrUrl)}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                        style={{ borderColor: accentBorder, color: accent }}
                      >
                        <QrCode className="h-4 w-4" /> View Full Size
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Primary checkout CTA button (branded). Reflects QR-handoff / payment / messenger
 * states exactly like the original and drives `handleProceedToPayment`.
 */
export function CheckoutCTA({ checkout, className = '' }: { checkout: UseCheckoutReturn; className?: string }) {
  const { paymentMethods, isProcessing, handleProceedToPayment, grandTotal } = checkout
  const { accent, accentText } = useAccent(checkout)

  return (
    <button
      type="button"
      onClick={handleProceedToPayment}
      disabled={isProcessing}
      className={`w-full h-14 inline-flex items-center justify-center gap-3 font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${className}`}
      style={{ backgroundColor: accent, color: accentText }}
    >
      {isProcessing ? (
        <>
          <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Processing Order...
        </>
      ) : paymentMethods.length > 0 ? (
        <>
          <CreditCard className="h-5 w-5" />
          <span>Proceed to Payment · {formatPrice(grandTotal)}</span>
        </>
      ) : (
        <span>Send Order via Messenger · {formatPrice(grandTotal)}</span>
      )}
    </button>
  )
}
