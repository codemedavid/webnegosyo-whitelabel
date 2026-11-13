'use client'

import { useEffect, useRef } from 'react'
import { Check, Mail, MessageSquareText, RefreshCw } from 'lucide-react'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'
import { isFunnelPlanTerm } from '@/lib/checkout-leads/payment-terms'
import { PAYMENT, THANKS } from './funnel-payment-copy'
import { CopyButton, MessengerHelp, PaymentHeader, ProgressSteps } from './funnel-payment-ui'
import { Kicker, Marker } from './funnel-ui'

/** Details ✓ → Payment ✓ → Setup: the buyer now waits on the last step. */
const SETUP_STEP = 2

function WhatHappensNext() {
  return (
    <section className="fn-card p-6 sm:p-8" aria-labelledby="funnel-thanks-next">
      <h2 id="funnel-thanks-next" className="fn-worth">{THANKS.nextTitle}</h2>
      <ol className="mt-5 space-y-5">
        {THANKS.nextSteps.map((step, index) => (
          <li key={step.title} className="flex gap-3.5">
            <span aria-hidden className="fn-step-num">{index + 1}</span>
            <div className="pt-0.5">
              <p className="text-[15px] font-medium leading-snug text-white">{step.title}</p>
              {step.note && (
                <p className={`mt-1 text-[13px] ${index === 0 ? 'font-semibold text-[#F5A623]' : 'text-[#A99C8D]'}`}>{step.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** SMS and email, never the actual number or address (the page is public to the reference). */
function WhereTheLinkGoes() {
  const channels = [
    { icon: MessageSquareText, title: THANKS.contactSms, body: THANKS.contactSmsBody },
    { icon: Mail, title: THANKS.contactEmail, body: THANKS.contactEmailBody },
  ]
  return (
    <section aria-labelledby="funnel-thanks-contact">
      <h2 id="funnel-thanks-contact" className="fn-worth text-center">{THANKS.contactTitle}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {channels.map(({ icon: Icon, title, body }) => (
          <li key={title} className="fn-card flex gap-3.5 p-5">
            <span className="fn-tile !h-11 !w-11 shrink-0 !rounded-xl">
              <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-white">{title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#A99C8D]">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReferenceAndScreenshot({
  referenceNumber,
  proofUrl,
  onReplace,
}: {
  referenceNumber: string
  proofUrl: string
  onReplace: () => void
}) {
  return (
    <section className="fn-card grid gap-px overflow-hidden sm:grid-cols-[1.3fr_1fr]">
      <div className="p-5 sm:p-6">
        <p className="fn-worth">{THANKS.reference}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="fn-tabular font-mono text-[19px] font-semibold tracking-[0.04em] text-white sm:text-[21px]">
            {referenceNumber}
          </span>
          <CopyButton value={referenceNumber} label="reference number" />
        </div>
        <p className="mt-2 text-[12.5px] text-[#A99C8D]">{THANKS.referenceHint}</p>
      </div>
      <div className="border-t border-white/10 p-5 sm:border-l sm:border-t-0 sm:p-6">
        <p className="fn-worth">{THANKS.shotTitle}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- the buyer's own upload */}
        <img src={proofUrl} alt={THANKS.shotAlt} className="mt-3 max-h-40 rounded-xl border border-white/10 object-contain" />
        <button type="button" onClick={onReplace} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#F5A623] underline-offset-4 hover:underline">
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />
          {THANKS.replace}
        </button>
      </div>
    </section>
  )
}

/**
 * What a buyer sees once their payment screenshot is saved: we review the
 * payment and their details, then text AND email the private setup link.
 * Shown in place of the payment step (same URL), so a reload or the shared
 * confirmation link lands here too. Scrolls itself to the top on arrival: the
 * upload box it replaces sits far down the payment step.
 */
export function FunnelThankYou({
  lead,
  proofUrl,
  onReplace,
}: {
  lead: CheckoutLeadConfirmation
  proofUrl: string
  onReplace: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div ref={rootRef}>
      <PaymentHeader />
      <main className="px-5 pb-20 pt-10 sm:pt-14">
        <div className="mx-auto max-w-[760px]">
          <div className="text-center">
            <span aria-hidden className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#3CC47C]/40 bg-[#3CC47C]/[0.12] shadow-[0_0_36px_rgba(60,196,124,0.25)]">
              <Check className="h-8 w-8 text-[#3CC47C]" strokeWidth={2.75} />
            </span>
            <div className="mt-6">
              <Kicker tone="amber">{THANKS.kicker}</Kicker>
            </div>
            <h1 ref={headingRef} tabIndex={-1} className="fn-h2 !mt-4 outline-none">
              <Marker>{THANKS.titleLead}</Marker> {THANKS.title}
            </h1>
            <p className="fn-lead mx-auto mt-4 max-w-xl">{THANKS.subtitle}</p>
          </div>
          <ProgressSteps currentStep={SETUP_STEP} />

          <div className="mt-8 space-y-5">
            <WhatHappensNext />
            <WhereTheLinkGoes />
            <ReferenceAndScreenshot referenceNumber={lead.reference_number} proofUrl={proofUrl} onReplace={onReplace} />
            {isFunnelPlanTerm(lead.payment_term) && (
              <p className="text-center text-[13px] leading-relaxed text-[#A99C8D]">{PAYMENT.haveReady}</p>
            )}
            <div className="flex flex-col items-center gap-5 pt-2 text-center">
              <p className="text-[14px] text-[#EFE6D8]">{THANKS.closeNote}</p>
              <MessengerHelp />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
