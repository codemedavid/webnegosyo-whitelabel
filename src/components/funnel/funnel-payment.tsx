'use client'

import Image from 'next/image'
import { Check, Lock, MessageCircle, ShieldCheck } from 'lucide-react'
import { BRAND } from '@/components/landing/landing-theme'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'
import { getPaymentTermLabel } from '@/lib/checkout-leads/payment-term-labels'
import { getCheckoutBalanceDue, isCheckoutPaymentTerm, isFunnelPlanTerm } from '@/lib/checkout-leads/payment-terms'
import { GUARANTEES } from './funnel-copy'
import { formatPeso } from './funnel-offer'
import { PAYMENT } from './funnel-payment-copy'
import { FunnelPaymentMethod } from './funnel-payment-method'
import { FunnelPaymentProof } from './funnel-payment-proof'
import { CopyButton } from './funnel-payment-ui'
import { Kicker, Marker } from './funnel-ui'

const FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'
/** Details → Payment → Setup: the buyer is on the middle step. */
const CURRENT_STEP = 1

function PaymentHeader() {
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

function ProgressSteps() {
  return (
    <ol className="mx-auto mt-7 flex w-fit items-center gap-2 text-[12.5px] font-medium" aria-label="Checkout progress">
      {PAYMENT.progress.map((step, index) => {
        const isDone = index < CURRENT_STEP
        const isCurrent = index === CURRENT_STEP
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

/** Reference (copyable), amount due and, on a downpayment or installments, what is left. */
function ReceiptStrip({ lead, balanceDue }: { lead: CheckoutLeadConfirmation; balanceDue: number }) {
  return (
    <div className="fn-card fn-card--amber mx-auto mt-8 grid max-w-[760px] gap-px overflow-hidden sm:grid-cols-[1.4fr_1fr]">
      <div className="p-5 sm:p-6">
        <p className="fn-worth">{PAYMENT.reference}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="fn-tabular font-mono text-[21px] font-semibold tracking-[0.04em] text-white sm:text-[23px]">
            {lead.reference_number}
          </span>
          <CopyButton value={lead.reference_number} label="reference number" />
        </div>
        <p className="mt-2 text-[12.5px] text-[#A99C8D]">{PAYMENT.referenceHint}</p>
      </div>
      <dl className="border-t border-white/10 p-5 sm:border-l sm:border-t-0 sm:p-6">
        <dt className="fn-worth">{PAYMENT.dueToday}</dt>
        <dd className="fn-tabular mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.03em] text-white">{formatPeso(lead.amount)}</dd>
        {balanceDue > 0 && (
          <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[13px] text-[#A99C8D]">
            <dt>{PAYMENT.balance}</dt>
            <dd className="fn-tabular">{formatPeso(balanceDue)}</dd>
          </div>
        )}
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px] text-[#A99C8D]">
          <dt>{PAYMENT.plan}</dt>
          <dd className="text-right">{getPaymentTermLabel(lead.payment_term)}</dd>
        </div>
      </dl>
    </div>
  )
}

function NextSteps({ isPlan }: { isPlan: boolean }) {
  return (
    <aside className="fn-card h-fit space-y-6 p-6 lg:sticky lg:top-24">
      <div>
        <h2 className="fn-worth">{PAYMENT.nextTitle}</h2>
        <ol className="mt-4 space-y-3">
          {PAYMENT.nextSteps.map((step, index) => (
            <li key={step} className="flex gap-3 text-[14px] leading-snug text-[#EFE6D8]">
              <span aria-hidden className="fn-step-num">{index + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {isPlan && <p className="mt-4 text-[12.5px] leading-relaxed text-[#A99C8D]">{PAYMENT.haveReady}</p>}
      </div>
      {isPlan && (
        <ul className="space-y-4 border-t border-white/10 pt-5">
          {GUARANTEES.map((guarantee) => (
            <li key={guarantee.title} className="flex gap-3">
              <ShieldCheck aria-hidden className="h-5 w-5 shrink-0 text-[#3CC47C]" strokeWidth={1.75} />
              <p className="text-[12.5px] leading-relaxed text-[#A99C8D]">
                <span className="font-semibold text-white">{guarantee.title}.</span> {guarantee.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-white/10 pt-5">
        <p className="text-[13px] text-[#A99C8D]">{PAYMENT.help}</p>
        <a
          href={`https://m.me/${FACEBOOK_PAGE_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fn-ghost-btn mt-2.5"
        >
          <MessageCircle aria-hidden className="h-4 w-4" />
          {PAYMENT.helpCta}
        </a>
      </div>
    </aside>
  )
}

/**
 * The funnel's payment step: shown in place right after the order form saves
 * a lead, and as /checkout/confirmation?confirm=<ref> (reload, shared link,
 * the older /checkout form). Renders inside `.funnel-world`.
 */
export function FunnelPayment({ lead }: { lead: CheckoutLeadConfirmation }) {
  const method = lead.platform_payment_methods
  const balanceDue =
    lead.payment_term && isCheckoutPaymentTerm(lead.payment_term) ? getCheckoutBalanceDue(lead.payment_term) : 0

  return (
    <>
      <PaymentHeader />
      <main className="px-5 pb-20 pt-10 sm:pt-14">
        <div className="mx-auto max-w-[1000px]">
          <div className="mx-auto max-w-3xl text-center">
            <Kicker tone="amber">{PAYMENT.kicker}</Kicker>
            <h1 className="fn-h2 !mt-4">
              {PAYMENT.titleLead} <Marker>{formatPeso(lead.amount)}</Marker>
            </h1>
            <p className="fn-lead mx-auto mt-4 max-w-xl">{PAYMENT.subtitle}</p>
          </div>
          <ProgressSteps />
          <ReceiptStrip lead={lead} balanceDue={balanceDue} />

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="space-y-5">
              <FunnelPaymentMethod method={method} />
              <FunnelPaymentProof referenceNumber={lead.reference_number} initialProofUrl={lead.payment_proof_url} amount={lead.amount} />
            </div>
            <NextSteps isPlan={isFunnelPlanTerm(lead.payment_term)} />
          </div>
        </div>
      </main>
    </>
  )
}
