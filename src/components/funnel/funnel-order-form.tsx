'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { submitCheckoutForm, fetchActivePlatformPaymentMethods } from '@/app/actions/checkout-leads'
import { createMetaEventId, getMetaBrowserData, trackMetaEvent } from '@/lib/meta-pixel'
import { MONTHLY_SUBSCRIPTION_PRICE } from '@/lib/checkout-leads/payment-terms'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { ORDER, ORDER_FORM } from './funnel-copy'
import { OFFER_NAME } from './funnel-offer'
import { FUNNEL_LINE } from './funnel-ui'

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

interface PaymentOption {
  id: string
  name: string
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
        const loaded = methods.map((method) => ({ id: method.id, name: method.name }))
        setOptions(loaded)
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

/**
 * Brunson's order form. A "yes" becomes a checkout lead on the monthly term
 * (amount computed server-side), then the existing confirmation page shows
 * the reference number and payment instructions.
 */
export function FunnelOrderForm() {
  const router = useRouter()
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
    // Stays pending once the lead is saved: the button must not re-arm while
    // the confirmation page loads, or a second tap files a duplicate lead.
    let isSaved = false
    try {
      const eventId = createMetaEventId('lead')
      const result = await submitCheckoutForm({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        business_name: parsed.data.businessName,
        selected_payment_method_id: parsed.data.paymentMethodId,
        payment_term: 'monthly_subscription',
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
        { content_name: OFFER_NAME, currency: 'PHP', value: result.data.amount ?? MONTHLY_SUBSCRIPTION_PRICE },
        eventId
      )
      isSaved = true
      const setupParam = result.setupToken ? `&setup=${encodeURIComponent(result.setupToken)}` : ''
      router.push(`/checkout/confirmation?confirm=${encodeURIComponent(result.data.reference_number)}${setupParam}`)
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
          <label htmlFor={`funnel-${field.key}`} className="mb-1.5 block text-[14px] font-bold" style={{ color: SMARTMENU.ink }}>
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
            className="block min-h-12 w-full rounded-xl border bg-white px-4 text-base outline-none transition-shadow focus:ring-2"
            style={{ borderColor: errors[field.key] ? SMARTMENU.red : FUNNEL_LINE, color: SMARTMENU.ink }}
          />
          {errors[field.key] && (
            <p id={`funnel-${field.key}-error`} className="mt-1 text-[13px]" style={{ color: SMARTMENU.red }}>
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
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-bold transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70 sm:text-lg"
        style={{ backgroundColor: SMARTMENU.red, color: '#FFF7EE' }}
      >
        {isSubmitting && <Loader2 aria-hidden className="h-5 w-5 animate-spin" />}
        {isSubmitting ? ORDER.submitting : `${ORDER.submit} →`}
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
      <legend className="mb-1.5 text-[14px] font-bold" style={{ color: SMARTMENU.ink }}>
        {ORDER_FORM.paymentLegend}
      </legend>
      {isLoading && <p className="text-[13px]" style={{ color: SMARTMENU.cocoa }}>{ORDER_FORM.paymentLoading}</p>}
      {(hasError || isEmpty) && (
        <p className="text-[13px]" style={{ color: SMARTMENU.red }}>
          {ORDER_FORM.paymentLoadError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const isSelected = option.id === selectedId
          return (
            <label
              key={option.id}
              className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border-2 bg-white px-4 text-[15px] font-bold"
              style={{ borderColor: isSelected ? SMARTMENU.red : FUNNEL_LINE, color: SMARTMENU.ink }}
            >
              <input
                type="radio"
                name="funnel-payment"
                value={option.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
                className="h-4 w-4 accent-current"
                style={{ color: SMARTMENU.red }}
              />
              {option.name}
            </label>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-1 text-[13px]" style={{ color: SMARTMENU.red }}>{error}</p>}
    </fieldset>
  )
}
