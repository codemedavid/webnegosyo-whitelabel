'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { paymentBrandFor } from '@/lib/checkout-leads/payment-brand'
import { PAYMENT } from './funnel-payment-copy'

const COPIED_RESET_MS = 2000

type LogoSize = 'choice' | 'card'

const LOGO_PLATE: Record<LogoSize, string> = {
  choice: 'h-9 w-[92px] rounded-lg px-2.5 py-1.5',
  card: 'h-12 w-[132px] rounded-xl px-3.5 py-2',
}

/**
 * The method's official logo on a white plate (both logos are drawn for a
 * light background). A method without known artwork shows its name instead.
 */
export function PaymentLogo({ name, size, isNameHidden = false }: { name: string; size: LogoSize; isNameHidden?: boolean }) {
  const brand = paymentBrandFor(name)
  if (!brand) {
    return <span className="text-[15px] font-semibold text-white">{name}</span>
  }
  return (
    <span className={`flex shrink-0 items-center justify-center bg-white shadow-[0_1px_0_rgba(255,255,255,0.4)_inset] ${LOGO_PLATE[size]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local SVG; next/image adds nothing here */}
      <img src={brand.logoSrc} alt={isNameHidden ? '' : brand.displayName} className="h-full w-full object-contain" />
    </span>
  )
}

/** A small "Copy" pill; says "Copied" for a moment after a tap. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [isCopied, setIsCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error(PAYMENT.copyFailed)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${PAYMENT.copy} ${label}`}
      className="fn-copy"
      data-copied={isCopied || undefined}
    >
      {isCopied ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />}
      <span aria-live="polite">{isCopied ? PAYMENT.copied : PAYMENT.copy}</span>
    </button>
  )
}

/** One "label · value · Copy" row of the payment card. */
export function CopyRow({ label, value, copyValue, copyLabel }: { label: string; value: string; copyValue?: string; copyLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#A99C8D]">{label}</dt>
        <dd className="fn-tabular mt-0.5 truncate text-[17px] font-semibold tracking-[0.01em] text-white">{value}</dd>
      </div>
      {copyValue && <CopyButton value={copyValue} label={copyLabel ?? label} />}
    </div>
  )
}
