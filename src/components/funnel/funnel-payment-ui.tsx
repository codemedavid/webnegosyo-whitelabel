'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Check, Copy, Lock, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { BRAND } from '@/components/landing/landing-theme'
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

const FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'

/** The payment step's and thank-you screen's top bar: brand + "Secure checkout". */
export function PaymentHeader() {
  return (
    <header className="fn-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1000px] items-center justify-between gap-3 px-5">
        <span className="flex items-center gap-2.5">
          <Image src="/smartmenu-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px] bg-[#FBF6ED] object-contain p-0.5" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">{BRAND.name}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-[#A99C8D]">
          <Lock aria-hidden className="h-3.5 w-3.5 text-[#3CC47C]" strokeWidth={2.25} />
          {PAYMENT.secure}
        </span>
      </div>
    </header>
  )
}

/** Details → Payment → Setup, with every step before `currentStep` ticked. */
export function ProgressSteps({ currentStep }: { currentStep: number }) {
  return (
    <ol className="mx-auto mt-7 flex w-fit items-center gap-2 text-[12.5px] font-medium" aria-label="Checkout progress">
      {PAYMENT.progress.map((step, index) => {
        const isDone = index < currentStep
        const isCurrent = index === currentStep
        return (
          <li key={step} className="flex items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
            {index > 0 && <span aria-hidden className={`h-px w-6 sm:w-10 ${isDone || isCurrent ? 'bg-[#F5A623]/60' : 'bg-white/15'}`} />}
            <span className={`fn-progress ${isDone ? 'fn-progress--done' : ''} ${isCurrent ? 'fn-progress--current' : ''}`}>
              {isDone ? <Check aria-hidden className="h-3 w-3" strokeWidth={3} /> : <span aria-hidden>{index + 1}</span>}
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** "May tanong?" + the Messenger button. */
export function MessengerHelp() {
  return (
    <div>
      <p className="text-[13px] text-[#A99C8D]">{PAYMENT.help}</p>
      <a href={`https://m.me/${FACEBOOK_PAGE_USERNAME}`} target="_blank" rel="noopener noreferrer" className="fn-ghost-btn mt-2.5">
        <MessageCircle aria-hidden className="h-4 w-4" />
        {PAYMENT.helpCta}
      </a>
    </div>
  )
}
