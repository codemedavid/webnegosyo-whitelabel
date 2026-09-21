'use client'

/**
 * Payment-method picker (branded). Shared by every checkout design.
 *
 * A wallet, not a form: each method is a tile (its QR or a monogram, the
 * name, a check badge when chosen) in a row that scrolls sideways on a phone
 * and wraps on wider screens. The chosen method opens a "ticket" underneath —
 * QR, copyable account rows, and a proof note — so the customer sees exactly
 * what they will be asked for before they proceed.
 *
 * `data-payment-methods` stays on the wrapper: the hook scrolls to it when a
 * customer proceeds without choosing.
 */

import { AlertCircle, Check, Maximize2, Receipt } from 'lucide-react'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { parsePaymentDetailLines } from '@/lib/payment-details-lines'
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
  const selected = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null

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

      <div className="-mx-2 -mt-2 flex snap-x gap-3 overflow-x-auto px-2 pb-1 pt-2 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {paymentMethods.map((method) => (
          <PaymentMethodTile
            key={method.id}
            method={method}
            isSelected={method.id === selectedPaymentMethod}
            accent={palette.accent}
            accentText={palette.accentText}
            accentSoft={palette.accentSoft}
            onSelect={() => setSelectedPaymentMethod(method.id)}
          />
        ))}
      </div>

      {selected && (
        <PaymentTicket
          key={selected.id}
          method={selected}
          accent={palette.accent}
          copiedText={copiedText}
          onCopy={handleCopyText}
          onEnlargeQr={openQrDialog}
        />
      )}
    </fieldset>
  )
}

interface PaymentMethodTileProps {
  method: PaymentMethod
  isSelected: boolean
  accent: string
  accentText: string
  accentSoft: string
  onSelect: () => void
}

function PaymentMethodTile({ method, isSelected, accent, accentText, accentSoft, onSelect }: PaymentMethodTileProps) {
  return (
    <label
      className="relative flex w-[7.25rem] shrink-0 snap-start cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 bg-white px-2 pb-3 pt-4 text-center transition-[border-color,background-color,transform] hover:border-gray-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-[color:var(--checkout-accent)] motion-safe:active:scale-[0.97]"
      style={{
        borderColor: isSelected ? accent : NEUTRAL_BORDER,
        backgroundColor: isSelected ? accentSoft : '#ffffff',
      }}
    >
      <input
        type="radio"
        name="payment-method"
        value={method.id}
        checked={isSelected}
        onChange={onSelect}
        className="sr-only"
      />
      {isSelected && (
        <span
          aria-hidden="true"
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
          style={{ backgroundColor: accent, color: accentText }}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      )}
      <MethodMark method={method} accent={accent} accentSoft={accentSoft} />
      <span className="line-clamp-2 w-full text-[13px] font-semibold leading-tight text-gray-900">
        {method.name}
      </span>
    </label>
  )
}

/** 56px mark: the method's QR when it has one, otherwise a monogram. */
function MethodMark({ method, accent, accentSoft }: { method: PaymentMethod; accent: string; accentSoft: string }) {
  if (method.qr_code_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={method.qr_code_url}
        alt=""
        className="h-14 w-14 rounded-xl border border-gray-200 bg-white object-cover"
      />
    )
  }
  const initial = method.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold"
      style={{ backgroundColor: accentSoft, color: accent }}
    >
      {initial}
    </span>
  )
}

interface PaymentTicketProps {
  method: PaymentMethod
  accent: string
  copiedText: string | null
  onCopy: (value: string, label: string) => void
  onEnlargeQr: (url: string) => void
}

function PaymentTicket({ method, accent, copiedText, onCopy, onEnlargeQr }: PaymentTicketProps) {
  const rows = parsePaymentDetailLines(method.details)
  const qrUrl = method.qr_code_url
  const needsProof = isPaymentProofRequired(method)

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">Pay with {method.name}</p>
        {needsProof && (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
            <Receipt className="h-3 w-3" /> Proof required
          </span>
        )}
      </div>

      {(qrUrl || rows.length > 0) && (
        <div className="space-y-3 border-t border-dashed border-gray-200 bg-gray-50/70 px-4 py-4">
          {qrUrl && (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onEnlargeQr(qrUrl)}
                aria-label={`Enlarge ${method.name} QR code`}
                className="shrink-0 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--checkout-accent)] motion-safe:active:scale-[0.97]"
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
      )}
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
          None have been set up for this order type. You can still place your order, and payment will be arranged with the store.
        </p>
      </div>
    </div>
  )
}
