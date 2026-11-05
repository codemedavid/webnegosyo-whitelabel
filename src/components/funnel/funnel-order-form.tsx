'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { submitCheckoutForm, fetchActivePlatformPaymentMethods } from '@/app/actions/checkout-leads'
import { createMetaEventId, getMetaBrowserData, trackMetaEvent } from '@/lib/meta-pixel'
import type { FunnelPlanTerm } from '@/lib/checkout-leads/payment-terms'
import { toCheckoutLeadConfirmation, type CheckoutLeadConfirmation } from '@/lib/checkout-leads/confirmation'
import { paymentBrandFor } from '@/lib/checkout-leads/payment-brand'
import { ORDER, ORDER_FORM } from './funnel-copy'
import { OFFER_NAME, dueTodayFor } from './funnel-offer'
import { PaymentLogo } from './funnel-payment-ui'

/** Philippine mobile number, local (09…) or international (639…) form. */
const PH_MOBILE = /^(09\d{9}|639\d{9})$/

const orderSchema = z.object({
  name: z.string().trim().min(2, ORDER_FORM.fields.name.error),
  email: z.string().trim().email(ORDER_FORM.fields.email.error),
  phone: z.string().regex(PH_MOBILE, ORDER_FORM.fields.phone.error),
  businessName: z.string().trim().min(2, ORDER_FORM.fields.businessName.error),
  paymentMethodId: z.string().min(1, ORDER_FORM.paymentRequired),
})

type OrderFields = z.infer<typeof orderSchema>
type FieldErrors = Partial<Record<keyof OrderFields, string>>

/** A method as the payment step shows it, loaded with the form so that step needs no fetch. */
interface PaymentOption {
  id: string
  name: string
  details: string | null
  qr_code_url: string | null
}

/** Warm the browser cache so the QR is already there when the payment step opens. */
function preloadQrCodes(options: PaymentOption[]) {
  for (const option of options) {
    if (option.qr_code_url) new Image().src = option.qr_code_url
  }
}

const EMPTY_FIELDS: OrderFields = { name: '', email: '', phone: '', businessName: '', paymentMethodId: '' }

const TEXT_FIELDS: ReadonlyArray<{
  key: Exclude<keyof OrderFields, 'paymentMethodId'>
  label: string
  placeholder: string
  type: string
  autoComplete: string
  inputMode?: 'tel' | 'email'
}> = [
  { key: 'name', ...ORDER_FORM.fields.name, type: 'text', autoComplete: 'name' },
  { key: 'businessName', ...ORDER_FORM.fields.businessName, type: 'text', autoComplete: 'organization' },
  { key: 'phone', ...ORDER_FORM.fields.phone, type: 'tel', autoComplete: 'tel', inputMode: 'tel' },
  { key: 'email', ...ORDER_FORM.fields.email, type: 'email', autoComplete: 'email', inputMode: 'email' },
]

function firstErrors(error: z.ZodError<OrderFields>): FieldErrors {
  return error.issues.reduce<FieldErrors>((errors, issue) => {
    const field = issue.path[0] as keyof OrderFields
    return errors[field] ? errors : { ...errors, [field]: issue.message }
  }, {})
}

function usePaymentOptions(onSingleOption: (id: string) => void) {
  const [options, setOptions] = useState<PaymentOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isCancelled = false
    fetchActivePlatformPaymentMethods()
      .then((methods) => {
        if (isCancelled) return
        const loaded = methods.map((method) => ({
          id: method.id,
          name: method.name,
          details: method.details ?? null,
          qr_code_url: method.qr_code_url ?? null,
        }))
        setOptions(loaded)
        preloadQrCodes(loaded)
        if (loaded.length === 1) onSingleOption(loaded[0].id)
      })
      .catch((error: unknown) => {
        console.error('[funnel] payment methods failed to load', error)
        if (!isCancelled) setHasError(true)
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
    // onSingleOption is a stable setter wrapper; load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { options, isLoading, hasError }
}

interface FunnelOrderFormProps {
  /** The plan the visitor picked above the form; the server prices it. */
  term: FunnelPlanTerm
  submitLabel: string
  /** The lead is saved: open its payment step. */
  onSaved: (confirmation: CheckoutLeadConfirmation) => void
}

/**
 * The payment step's data, from the save's answer (reference, the amount the
 * SERVER priced) plus the chosen method already on screen. Nothing personal:
 * the same fields the public confirmation page reads.
 */
function confirmationFor(
  saved: { reference_number: string; amount: number | null },
  term: FunnelPlanTerm,
  method: PaymentOption | undefined
): CheckoutLeadConfirmation | null {
  return toCheckoutLeadConfirmation({
    reference_number: saved.reference_number,
    amount: saved.amount ?? dueTodayFor(term),
    payment_term: term,
    payment_proof_url: null,
    platform_payment_methods: method
      ? { name: method.name, details: method.details, qr_code_url: method.qr_code_url }
      : null,
  })
}

/**
 * The order form. A "yes" becomes a checkout lead on the chosen plan's term
 * (amount computed server-side), then the payment step opens in place: one
 * round trip, no page load between the button and the QR.
 */
export function FunnelOrderForm({ term, submitLabel, onSaved }: FunnelOrderFormProps) {
  const isSubmittingRef = useRef(false)
  const [fields, setFields] = useState<OrderFields>(EMPTY_FIELDS)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const payments = usePaymentOptions((id) => setFields((prev) => ({ ...prev, paymentMethodId: id })))

  function updateField(key: keyof OrderFields, raw: string) {
    const value = key === 'phone' ? raw.replace(/\D/g, '') : raw
    setFields((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isSubmittingRef.current) return
    const parsed = orderSchema.safeParse(fields)
    if (!parsed.success) {
      setErrors(firstErrors(parsed.error))
      return
    }

    isSubmittingRef.current = true
    setIsSubmitting(true)
    // Stays pending once the lead is saved: the button must never re-arm
    // under the payment step, or a second tap files a duplicate lead.
    let isSaved = false
    try {
      const eventId = createMetaEventId('lead')
      const result = await submitCheckoutForm({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        business_name: parsed.data.businessName,
        selected_payment_method_id: parsed.data.paymentMethodId,
        payment_term: term,
        notes: `Funnel: ${OFFER_NAME}`,
        meta: { eventId, ...getMetaBrowserData() },
      })
      if (result.error || !result.data) {
        toast.error(ORDER_FORM.saveFailed)
        console.error('[funnel] checkout lead refused', result.error)
        return
      }
      trackMetaEvent(
        'Lead',
        { content_name: OFFER_NAME, currency: 'PHP', value: result.data.amount ?? dueTodayFor(term) },
        eventId
      )
      const confirmation = confirmationFor(
        result.data,
        term,
        payments.options.find((option) => option.id === parsed.data.paymentMethodId)
      )
      if (!confirmation) {
        toast.error(ORDER_FORM.saveFailed)
        console.error('[funnel] checkout lead saved without a reference number')
        return
      }
      isSaved = true
      onSaved(confirmation)
    } catch (error) {
      console.error('[funnel] checkout lead failed', error)
      toast.error(ORDER_FORM.connectionFailed)
    } finally {
      if (!isSaved) {
        isSubmittingRef.current = false
        setIsSubmitting(false)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {TEXT_FIELDS.map((field) => (
        <div key={field.key}>
          <label htmlFor={`funnel-${field.key}`} className="mb-1.5 block text-[13.5px] font-medium text-[#EFE6D8]">
            {field.label}
          </label>
          <input
            id={`funnel-${field.key}`}
            type={field.type}
            inputMode={field.inputMode}
            autoComplete={field.autoComplete}
            placeholder={field.placeholder}
            value={fields[field.key]}
            onChange={(event) => updateField(field.key, event.target.value)}
            aria-invalid={Boolean(errors[field.key])}
            aria-describedby={errors[field.key] ? `funnel-${field.key}-error` : undefined}
            className="fn-input"
          />
          {errors[field.key] && (
            <p id={`funnel-${field.key}-error`} className="mt-1 text-[13px] text-[#FF8A73]">
              {errors[field.key]}
            </p>
          )}
        </div>
      ))}

      <PaymentPicker
        options={payments.options}
        isLoading={payments.isLoading}
        hasError={payments.hasError}
        selectedId={fields.paymentMethodId}
        error={errors.paymentMethodId}
        onSelect={(id) => updateField('paymentMethodId', id)}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="fn-cta fn-cta--large"
      >
        {isSubmitting && <Loader2 aria-hidden className="h-5 w-5 animate-spin" />}
        <span>{isSubmitting ? ORDER.submitting : `${submitLabel} →`}</span>
      </button>
    </form>
  )
}

function PaymentPicker({
  options,
  isLoading,
  hasError,
  selectedId,
  error,
  onSelect,
}: {
  options: PaymentOption[]
  isLoading: boolean
  hasError: boolean
  selectedId: string
  error?: string
  onSelect: (id: string) => void
}) {
  // Loaded, but no active method: the visitor could never pass validation.
  const isEmpty = !isLoading && !hasError && options.length === 0
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13.5px] font-medium text-[#EFE6D8]">
        {ORDER_FORM.paymentLegend}
      </legend>
      {isLoading && <p className="text-[13px] text-[#A99C8D]">{ORDER_FORM.paymentLoading}</p>}
      {(hasError || isEmpty) && (
        <p className="text-[13px] text-[#FF8A73]">
          {ORDER_FORM.paymentLoadError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((option) => {
          const isSelected = option.id === selectedId
          const hasLogo = paymentBrandFor(option.name) !== null
          return (
            <label key={option.id} className="fn-choice text-[15px] font-semibold text-white">
              <input
                type="radio"
                name="funnel-payment"
                value={option.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
              />
              <span className="fn-choice-logo">
                {/* The logo says it; the name stays for screen readers. */}
                <span className={hasLogo ? 'sr-only' : ''}>{option.name}</span>
                {hasLogo && <PaymentLogo name={option.name} size="choice" isNameHidden />}
              </span>
            </label>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-1 text-[13px] text-[#FF8A73]">{error}</p>}
    </fieldset>
  )
}
