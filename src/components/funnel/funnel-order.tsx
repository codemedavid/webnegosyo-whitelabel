'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import type { CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'
import { getCheckoutBalanceDue, type FunnelPlanTerm } from '@/lib/checkout-leads/payment-terms'
import { CountdownChip } from './funnel-countdown'
import { GUARANTEES, ORDER, PLANS } from './funnel-copy'
import {
  BONUS_MONTH_VALUE,
  FUNNEL_ORDER_ANCHOR,
  SETUP_FEE_WAIVED,
  dueTodayFor,
  formatPeso,
  termForPlan,
  type FunnelPlanId,
  type SixMonthPayment,
} from './funnel-offer'
import { FunnelOrderForm } from './funnel-order-form'
import { FunnelPayment } from './funnel-payment'
import { CheckMark, CrossMark, FN, Kicker, Marker } from './funnel-ui'

/** The six-month plan is the one the page sells, so it starts chosen. */
const DEFAULT_PLAN: FunnelPlanId = 'six_month'
const DEFAULT_PAYMENT: SixMonthPayment = 'full'

function PlanRadio({
  plan,
  isSelected,
  onSelect,
  onChoose,
  children,
}: {
  plan: FunnelPlanId
  isSelected: boolean
  /** Arrow keys on the radio group: select only. */
  onSelect: (plan: FunnelPlanId) => void
  /** A tap or click on the card: select it and go to the form. */
  onChoose: (plan: FunnelPlanId) => void
  children: React.ReactNode
}) {
  const surface = plan === 'six_month' ? 'fn-card fn-card--amber' : 'fn-card'
  return (
    <label
      // Only a tap on the card itself. The radio's own click (the one the
      // label forwards, or an arrow key) must not scroll a second time or
      // yank a keyboard user down the page.
      onClick={(event) => {
        if (!(event.target instanceof HTMLInputElement)) onChoose(plan)
      }}
      className={`${surface} relative block cursor-pointer p-6 transition-shadow sm:p-7 ${
        isSelected ? 'outline-2 outline-offset-4 outline-[#F5A623]/60 outline-solid' : 'opacity-90 hover:opacity-100'
      }`}
    >
      {/* Named by the plan name + price only: the card also holds a ticking countdown. */}
      <input
        type="radio"
        name="funnel-plan"
        value={plan}
        checked={isSelected}
        onChange={() => onSelect(plan)}
        aria-labelledby={`funnel-plan-${plan}`}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`absolute right-6 top-6 flex h-5 w-5 items-center justify-center rounded-full border peer-focus-visible:ring-2 peer-focus-visible:ring-[#F5A623]/50 ${
          isSelected ? 'border-[#F5A623]' : 'border-white/30'
        }`}
      >
        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[#F5A623] shadow-[0_0_10px_#F5A623]" />}
      </span>
      {children}
    </label>
  )
}

function PointList({ points, missing = [] }: { points: readonly string[]; missing?: readonly string[] }) {
  return (
    <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-5">
      {points.map((point) => (
        <li key={point} className="flex gap-2.5 text-[14.5px] leading-snug text-[#EFE6D8]">
          <CheckMark />
          {point}
        </li>
      ))}
      {missing.map((point) => (
        <li key={point} className="flex gap-2.5 text-[14.5px] leading-snug text-[#A99C8D]">
          <CrossMark />
          {point}
        </li>
      ))}
    </ul>
  )
}

function SixMonthCard() {
  const plan = PLANS.sixMonth
  return (
    <>
      <p className="fn-worth !text-[#F5A623]">{plan.ribbon}</p>
      <p id="funnel-plan-six_month" className="mt-3 text-[20px] font-semibold tracking-[-0.01em] text-white">
        {plan.name} <span className="sr-only">{plan.price}</span>
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span className="fn-tabular text-[48px] font-semibold leading-none tracking-[-0.035em] text-white sm:text-[56px]">{plan.price}</span>
        <span className="fn-worth-old fn-tabular !text-[17px]">{plan.anchor}</span>
      </p>
      <p className="fn-serif mt-2 text-[20px] text-[#F5A623]">{plan.perMonth}</p>
      <PointList points={plan.points} />
      <div className="mt-6">
        <CountdownChip />
      </div>
      {/* Looks like a button; the whole card is the click target. */}
      <span aria-hidden className="fn-cta fn-cta--small mt-6 w-full !min-h-[48px] !text-[15px] sm:w-auto">
        {PLANS.sixMonthCta}
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </>
  )
}

function MonthlyCard() {
  const plan = PLANS.monthly
  return (
    <>
      <p id="funnel-plan-monthly" className="text-[20px] font-semibold tracking-[-0.01em] text-white">
        {plan.name} <span className="sr-only">{plan.price}{plan.unit}</span>
      </p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="fn-tabular text-[40px] font-semibold leading-none tracking-[-0.035em] text-white">{plan.price}</span>
        <span className="text-[15px] text-[#A99C8D]">{plan.unit}</span>
      </p>
      <PointList points={plan.points} missing={plan.missing} />
      <span aria-hidden className="fn-ghost-btn mt-6 w-full sm:w-auto">
        {PLANS.monthlyCta}
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </>
  )
}

function PaymentChoice({ payment, onChange }: { payment: SixMonthPayment; onChange: (payment: SixMonthPayment) => void }) {
  const options = [
    { value: 'full' as const, ...PLANS.payFull },
    { value: 'installment' as const, ...PLANS.payInstallment },
  ]
  return (
    <fieldset>
      <legend className="mb-2.5 text-[14px] font-semibold text-white">{PLANS.paymentLegend}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="fn-choice">
            <input
              type="radio"
              name="funnel-six-month-payment"
              value={option.value}
              checked={option.value === payment}
              onChange={() => onChange(option.value)}
            />
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold text-white">{option.label}</span>
              <span className="block text-[13px] text-[#A99C8D]">
                <span className="fn-tabular font-semibold text-[#F5A623]">{option.amount}</span>
                {` ${option.note}`}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SummaryRow({ label, children, isMuted = false }: { label: string; children: React.ReactNode; isMuted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${isMuted ? 'text-[#A99C8D]' : 'text-[#EFE6D8]'}`}>
      <dt>{label}</dt>
      <dd className="fn-tabular">{children}</dd>
    </div>
  )
}

function summaryNote(term: FunnelPlanTerm): string {
  if (term === 'six_month_installment') return ORDER.installmentNote
  if (term === 'monthly_subscription') return ORDER.monthlyNote
  return ORDER.sixMonthNote
}

function planLine(term: FunnelPlanTerm): string {
  if (term === 'six_month_installment') return ORDER.installmentLine
  if (term === 'monthly_subscription') return ORDER.monthlyLine
  return ORDER.sixMonthLine
}

function OrderSummary({ plan, payment }: { plan: FunnelPlanId; payment: SixMonthPayment }) {
  const term = termForPlan(plan, payment)
  const isSixMonth = plan === 'six_month'
  const isPaidInFull = term === 'six_month_full'
  const balance = getCheckoutBalanceDue(term)

  return (
    <aside className="fn-card h-fit p-6 lg:sticky lg:top-24">
      <h3 className="fn-worth">{ORDER.summaryTitle}</h3>
      <dl className="mt-4 space-y-3 text-[14.5px]">
        <SummaryRow label={planLine(term)}>
          <span className="font-semibold text-white">{formatPeso(dueTodayFor(term))}</span>
        </SummaryRow>
        {isPaidInFull && (
          <SummaryRow label={ORDER.bonusMonthLine}>
            <span className="fn-worth-old mr-2 !text-[14px]">{formatPeso(BONUS_MONTH_VALUE)}</span>
            <span className="font-semibold text-[#3CC47C]">₱0</span>
          </SummaryRow>
        )}
        {isSixMonth && (
          <SummaryRow label={ORDER.setupLine}>
            <span className="fn-worth-old mr-2 !text-[14px]">{formatPeso(SETUP_FEE_WAIVED)}</span>
            <span className="font-semibold text-[#3CC47C]">₱0</span>
          </SummaryRow>
        )}
        {balance > 0 && (
          <SummaryRow label={term === 'six_month_installment' ? ORDER.installmentBalance : ORDER.balance} isMuted>
            {formatPeso(balance)}
          </SummaryRow>
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-4">
          <dt className="text-[16px] font-semibold text-white">{ORDER.dueToday}</dt>
          <dd className="fn-tabular text-[24px] font-semibold tracking-[-0.02em] text-white" data-testid="funnel-due-today">
            {formatPeso(dueTodayFor(term))}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[12.5px] leading-relaxed text-[#A99C8D]">{summaryNote(term)}</p>
      <ul className="mt-6 space-y-4 border-t border-white/10 pt-5">
        {GUARANTEES.map((guarantee) => (
          <li key={guarantee.title} className="flex gap-3">
            <ShieldCheck aria-hidden className="h-5 w-5 shrink-0 text-[#3CC47C]" strokeWidth={1.75} />
            <p className="text-[12.5px] leading-relaxed text-[#A99C8D]">
              <span className="font-semibold text-white">{guarantee.title}.</span> {guarantee.body}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/**
 * Scroll the form into view. On a mouse/keyboard device the name field gets
 * focus too; on a phone that would pop the keyboard up mid-scroll.
 */
function goToForm(formCard: HTMLElement | null) {
  if (!formCard) return
  const isReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  formCard.scrollIntoView({ behavior: isReducedMotion ? 'auto' : 'smooth', block: 'start' })
  const isFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? false
  if (isFinePointer) formCard.querySelector<HTMLInputElement>('input.fn-input')?.focus({ preventScroll: true })
}

function confirmationPath(referenceNumber: string): string {
  return `/checkout/confirmation?confirm=${encodeURIComponent(referenceNumber)}`
}

/**
 * The payment step, laid over the whole funnel the moment the lead is saved.
 * It looks exactly like /checkout/confirmation, and the address bar is moved
 * there (no navigation), so a reload or a shared link opens the same page.
 */
function PaymentTakeover({ lead }: { lead: CheckoutLeadConfirmation }) {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.history.replaceState(null, '', confirmationPath(lead.reference_number))
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    layerRef.current?.focus()
    return () => {
      root.style.overflow = previousOverflow
    }
  }, [lead.reference_number])

  return (
    <div ref={layerRef} tabIndex={-1} className="fixed inset-0 z-[70] overflow-y-auto outline-none" style={{ backgroundColor: FN.bg }}>
      <FunnelPayment lead={lead} />
    </div>
  )
}

/**
 * Plans and the order form in one section: the six-month plan starts chosen,
 * its payment (in full, or ₱999 a month) sits right under the cards, and the
 * form files whichever term the visitor ends up on.
 */
export function FunnelOrder() {
  const [plan, setPlan] = useState<FunnelPlanId>(DEFAULT_PLAN)
  const [payment, setPayment] = useState<SixMonthPayment>(DEFAULT_PAYMENT)
  const [savedLead, setSavedLead] = useState<CheckoutLeadConfirmation | null>(null)
  const formCardRef = useRef<HTMLDivElement>(null)

  function choosePlan(next: FunnelPlanId) {
    setPlan(next)
    // After the render: the form card changes height with the plan.
    requestAnimationFrame(() => goToForm(formCardRef.current))
  }
  const term = termForPlan(plan, payment)
  const submitLabel = plan === 'six_month' ? ORDER.submitSixMonth : ORDER.submitMonthly

  return (
    <section id={FUNNEL_ORDER_ANCHOR} className="scroll-mt-20 px-5 py-20">
      <div className="mx-auto max-w-[1000px]">
        <div className="mx-auto max-w-3xl text-center">
          <Kicker>{PLANS.eyebrow}</Kicker>
          <h2 className="fn-h2">
            {PLANS.titleLead} <Marker>{PLANS.titleMarker}</Marker>
          </h2>
          <p className="fn-lead mx-auto mt-4 max-w-2xl">{PLANS.subtitle}</p>
        </div>

        <fieldset className="mt-12 grid min-w-0 gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
          <legend className="sr-only">{PLANS.eyebrow}</legend>
          <PlanRadio plan="six_month" isSelected={plan === 'six_month'} onSelect={setPlan} onChoose={choosePlan}>
            <SixMonthCard />
          </PlanRadio>
          <PlanRadio plan="monthly" isSelected={plan === 'monthly'} onSelect={setPlan} onChoose={choosePlan}>
            <MonthlyCard />
          </PlanRadio>
        </fieldset>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div ref={formCardRef} data-testid="funnel-order-form-card" className="fn-card scroll-mt-24 space-y-7 p-6 sm:p-8">
            {plan === 'six_month' && <PaymentChoice payment={payment} onChange={setPayment} />}
            <div>
              <h3 className="mb-4 text-[18px] font-semibold tracking-[-0.01em] text-white">{ORDER.formTitle}</h3>
              <FunnelOrderForm term={term} submitLabel={submitLabel} onSaved={setSavedLead} />
            </div>
            <p className="text-center text-[12.5px] leading-relaxed text-[#A99C8D]">{ORDER.afterSubmit}</p>
          </div>
          <OrderSummary plan={plan} payment={payment} />
        </div>
      </div>
      {savedLead && <PaymentTakeover lead={savedLead} />}
    </section>
  )
}
