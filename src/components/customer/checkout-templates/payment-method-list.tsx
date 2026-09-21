'use client'

/**
 * Payment-method selector (branded). Used by the modern / wizard / minimal /
 * express designs; Classic keeps its own verbatim markup.
 *
 * One radiogroup rendered as a single list: each option is a tappable row
 * (custom radio, a QR thumbnail or monogram, the name, and a one-line hint),
 * and the selected option unfolds in place to show its copyable account rows
 * and QR. Keeping the details inside the option — instead of in a separate
 * "Selected Payment Method" card — means the eye never has to travel.
 *
 * `data-payment-methods` stays on the wrapper: the hook scrolls to it when a
 * customer proceeds without choosing.
 */

import { AlertCircle, Check, Maximize2, Receipt } from 'lucide-react'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { getPaymentMethodHint, parsePaymentDetailLines } from '@/lib/payment-details-lines'
import { isPaymentProofRequired } from '@/lib/payment-proof'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PaymentMethod } from '@/types/database'
import { PaymentDetailRows } from './payment-detail-rows'

const NEUTRAL_BORDER = '#e5e7eb'

export function PaymentMethodList({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    paymentMethods, selectedPaymentMethod, setSelectedPaymentMethod, openQrDialog,
    handleCopyText, copiedText, orderType, tenant, branding,
  } = checkout
  const palette = getCheckoutPalette(tenant, branding)

  if (paymentMethods.length === 0) {
    if (!orderType || !tenant) return null
    return <NoPaymentMethods />
  }

  return (
    <fieldset
      className="min-w-0"
      data-payment-methods
      style={{ ['--checkout-accent' as string]: palette.accent }}
    >
      <legend className="sr-only">Payment method</legend>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {paymentMethods.map((method, index) => {
          const isSelected = selectedPaymentMethod === method.id
          return (
            <div key={method.id} className={index > 0 ? 'border-t border-gray-100' : ''}>
              <PaymentMethodOption
                method={method}
                isSelected={isSelected}
                accent={palette.accent}
                accentSoft={palette.accentSoft}
                onSelect={() => setSelectedPaymentMethod(method.id)}
              />
              {isSelected && (
                <PaymentMethodDetails
                  method={method}
                  accent={palette.accent}
                  copiedText={copiedText}
                  onCopy={handleCopyText}
                  onEnlargeQr={openQrDialog}
                />
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

interface PaymentMethodOptionProps {
  method: PaymentMethod
  isSelected: boolean
  accent: string
  accentSoft: string
  onSelect: () => void
}

function PaymentMethodOption({ method, isSelected, accent, accentSoft, onSelect }: PaymentMethodOptionProps) {
  const hint = getPaymentMethodHint(method)
  const needsProof = isPaymentProofRequired(method)

  return (
    <label
      className="relative flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[color:var(--checkout-accent)]"
      style={isSelected ? { backgroundColor: accentSoft } : undefined}
    >
      <input
        type="radio"
        name="payment-method"
        value={method.id}
        checked={isSelected}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{
          borderColor: isSelected ? accent : '#9ca3af',
          backgroundColor: isSelected ? accent : 'transparent',
        }}
      >
        {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>

      <MethodTile method={method} accent={accent} accentSoft={accentSoft} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-gray-900">
          {method.name}
        </span>
        {hint && (
          <span className="mt-0.5 block truncate text-[13px] text-gray-500">{hint}</span>
        )}
      </span>

      {needsProof && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          <Receipt className="h-3 w-3" /> Proof
        </span>
      )}
    </label>
  )
}

/** Leading 40px tile: the method's QR when it has one, otherwise a monogram. */
function MethodTile({ method, accent, accentSoft }: { method: PaymentMethod; accent: string; accentSoft: string }) {
  if (method.qr_code_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={method.qr_code_url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
      />
    )
  }
  const initial = method.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold"
      style={{ backgroundColor: accentSoft, color: accent }}
    >
      {initial}
    </span>
  )
}

interface PaymentMethodDetailsProps {
  method: PaymentMethod
  accent: string
  copiedText: string | null
  onCopy: (value: string, label: string) => void
  onEnlargeQr: (url: string) => void
}

function PaymentMethodDetails({ method, accent, copiedText, onCopy, onEnlargeQr }: PaymentMethodDetailsProps) {
  const rows = parsePaymentDetailLines(method.details)
  const qrUrl = method.qr_code_url
  if (rows.length === 0 && !qrUrl) return null

  return (
    <div className="space-y-3 border-t border-gray-100 bg-gray-50/70 px-4 py-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      {qrUrl && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onEnlargeQr(qrUrl)}
            aria-label={`Enlarge ${method.name} QR code`}
            className="shrink-0 rounded-xl bg-white p-1.5 shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--checkout-accent)] motion-safe:active:scale-[0.97]"
            style={{ border: `1px solid ${NEUTRAL_BORDER}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="" className="h-24 w-24 object-contain" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">Scan to pay with {method.name}</p>
            <button
              type="button"
              onClick={() => onEnlargeQr(qrUrl)}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: accent }}
            >
              <Maximize2 className="h-3.5 w-3.5" /> Enlarge QR
            </button>
          </div>
        </div>
      )}
      <PaymentDetailRows rows={rows} copiedText={copiedText} onCopy={onCopy} accent={accent} />
    </div>
  )
}

function NoPaymentMethods() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
      <div>
        <h3 className="text-sm font-semibold text-amber-900">No payment methods yet</h3>
        <p className="mt-0.5 text-sm text-amber-800">
          None have been set up for this order type. You can still place your order, and payment will be arranged over Messenger.
        </p>
      </div>
    </div>
  )
}
