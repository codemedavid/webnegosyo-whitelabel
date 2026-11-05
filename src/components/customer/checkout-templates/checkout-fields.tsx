'use client'

/**
 * Customer information inputs. Owns ALL the field-type logic (map-backed
 * address / PH phone / long answer / dropdown / buttons / tick box / date /
 * text) in one place, drawn in the chosen field style.
 *
 * After a tap on "Place order" (or "Next") found mistakes, each one shows
 * beside its question (`checkout.fieldErrors`), the boxes say so to screen
 * readers (`aria-invalid` / `aria-describedby`) and the page scrolls to the
 * first. The toast stays as well.
 */

import { useEffect, useId, useRef } from 'react'
import { CalendarDays, Hash, Mail, MessageSquare, Phone, User, type LucideIcon } from 'lucide-react'

import { isDeliveryAddressField, isTableNumberField } from '@/lib/checkout-field-presets'
import { readFieldRules } from '@/lib/checkout-field-rules'
import { renderableFieldType, type CheckoutFieldType } from '@/lib/checkout-field-types'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

import { CheckoutAddressField } from './checkout-address-field'
import { CheckoutFieldControl, isPhPhoneField, type CheckoutFormField } from './checkout-field-control'
import { CheckoutLoyaltyProgress } from './checkout-loyalty-progress'
import { CO, checkoutThemeStyle } from './checkout-theme'
import { fieldStyleSpec, type CheckoutFieldsLook, type FieldStyleSpec } from './field-styles'
import { SmsOptInCheckbox } from './sms-opt-in-checkbox'

interface CheckoutFieldsProps {
  checkout: UseCheckoutReturn
  columns?: 1 | 2
  /** Off when the stamp card is placed on the page by itself (Page Designer). */
  showLoyalty?: boolean
  /** Off when the texts tick box is placed on the page by itself (Page Designer). */
  showSmsOptIn?: boolean
  /** The answer boxes' style (Page Designer); absent = today's boxes. */
  look?: CheckoutFieldsLook
}

const NO_ERRORS: Readonly<Record<string, string>> = {}

/** Kinds whose label can sit inside the box (the floating styles). */
const FLOATABLE: readonly CheckoutFieldType[] = ['text', 'email', 'number', 'phone', 'textarea', 'select', 'date']
/** Kinds whose box shows something even when empty: their floating label starts raised. */
const ALWAYS_RAISED: readonly CheckoutFieldType[] = ['select', 'date']
/** Kinds that need the row to themselves in the inset list (label above, not beside). */
const STACKED: readonly CheckoutFieldType[] = ['textarea', 'choice']

const PILL_ICONS: Partial<Record<CheckoutFieldType, LucideIcon>> = {
  text: User,
  phone: Phone,
  email: Mail,
  number: Hash,
  textarea: MessageSquare,
  date: CalendarDays,
}

const LABEL_CLASS: Record<'above' | 'kiosk' | 'inset' | 'joined', string> = {
  above: `block text-sm font-medium mb-1.5 ${CO.text}`,
  kiosk: `block text-lg font-bold mb-2 ${CO.text}`,
  inset: `w-2/5 shrink-0 py-3 text-sm font-medium ${CO.text}`,
  joined: `block text-xs font-medium ${CO.muted}`,
}
const STACKED_INSET_LABEL = `block pt-3 pb-1 text-sm font-medium ${CO.text}`

const RAISED = 'top-2 translate-y-0 text-xs'
const peerFocusRaise = 'peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs'

function pillIcon(field: CheckoutFormField, type: CheckoutFieldType): LucideIcon | undefined {
  if (isTableNumberField(field)) return Hash
  return PILL_ICONS[type]
}

/**
 * Grid span of a question: its `width` rule, else today's (in two columns,
 * long answers and the address span the row). One column stays a one-column
 * grid unless some question is half width.
 */
function spanClass(field: CheckoutFormField, type: CheckoutFieldType, columns: 1 | 2, hasHalf: boolean): string {
  const width = readFieldRules(field.validation_rules).width
  if (columns === 1) return hasHalf && width !== 'half' ? 'md:col-span-2' : ''
  const isWide = width ? width === 'full' : type === 'textarea' || isDeliveryAddressField(field)
  return isWide ? 'md:col-span-2' : ''
}

interface QuestionProps {
  checkout: UseCheckoutReturn
  field: CheckoutFormField
  spec: FieldStyleSpec
  baseId: string
  error: string | undefined
  wrapperClass: string
}

function Required() {
  return <span data-part="error" className={`ml-1 ${CO.error}`}>*</span>
}

function CheckoutQuestion({ checkout, field, spec, baseId, error, wrapperClass }: QuestionProps) {
  const id = `${baseId}-${field.id}`
  const labelId = `${id}-label`
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const type = renderableFieldType(field.field_type)
  const isAddress = isDeliveryAddressField(field)
  const help = readFieldRules(field.validation_rules).help
  const describedBy = [error ? errorId : '', help ? helpId : ''].filter(Boolean).join(' ') || undefined
  const value = checkout.customerData[field.field_name] || ''

  const canFloat = spec.label === 'floating' && !isAddress && !isPhPhoneField(checkout, field) && FLOATABLE.includes(type)
  const placement = spec.label === 'floating' ? (canFloat ? 'floating' : 'above') : spec.label
  const isInsetRow = placement === 'inset' && !STACKED.includes(type) && !isAddress && type !== 'checkbox'
  const labelClass = placement === 'inset' && !isInsetRow ? STACKED_INSET_LABEL : LABEL_CLASS[placement === 'floating' ? 'above' : placement]
  const icon = spec.hasIcon && !isAddress ? pillIcon(field, type) : undefined
  const boxClass = canFloat ? `peer ${spec.box} ${spec.floatBox ?? ''}` : spec.box
  const textareaClass = canFloat ? `peer ${spec.box} ${spec.floatBox ?? ''}` : spec.textareaBox

  const control = isAddress ? (
    <CheckoutAddressField
      checkout={checkout}
      fieldName={field.field_name}
      placeholder={field.placeholder}
      isRequired={field.is_required}
      inputClassName={spec.box}
      labelClassName={CO.text}
    />
  ) : (
    <CheckoutFieldControl
      checkout={checkout}
      field={field}
      id={id}
      boxClass={boxClass}
      textareaClass={textareaClass}
      labelId={labelId}
      describedBy={describedBy}
      isInvalid={!!error}
      icon={icon}
    />
  )

  const labelText = (
    <>
      {field.field_label}
      {field.is_required && <Required />}
    </>
  )

  const notes = (
    <>
      {isAddress && checkout.deliveryOutOfRange && (
        <p data-part="error" className={`mt-1.5 text-sm font-medium ${CO.error}`}>
          This address is outside the delivery area
          {checkout.tenant?.delivery_radius_km ? ` (${checkout.tenant.delivery_radius_km} km)` : ''}.
          {' '}Please choose a closer address or switch to pickup.
        </p>
      )}
      {isAddress && !checkout.deliveryOutOfRange && checkout.deliveryFee !== null && checkout.deliveryDistanceKm !== null && (
        <p data-part="muted" className={`mt-1.5 text-xs ${CO.muted}`}>
          {checkout.deliveryDistanceKm.toFixed(1)} km away
        </p>
      )}
      {help && (
        <p id={helpId} data-part="muted" className={`mt-1.5 text-xs ${CO.muted}`}>
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} data-part="error" data-field-error="" className={`mt-1.5 text-sm font-medium ${CO.error}`}>
          {error}
        </p>
      )}
    </>
  )

  // A tick box answers with its own label beside it.
  if (type === 'checkbox') {
    return (
      <div data-question="" className={wrapperClass}>
        <div className={`flex items-start gap-2.5 ${placement === 'inset' ? 'py-3' : ''}`}>
          {control}
          <label htmlFor={id} id={labelId} data-part="label" className={`text-sm font-medium ${CO.text}`}>
            {labelText}
          </label>
        </div>
        {notes}
      </div>
    )
  }

  // Buttons are labelled by the question (there is no single box to point at).
  const label =
    type === 'choice' ? (
      <span id={labelId} data-part="label" className={labelClass}>
        {labelText}
      </span>
    ) : (
      <label htmlFor={id} data-part="label" className={labelClass}>
        {labelText}
      </label>
    )

  if (placement === 'floating') {
    const resting = type === 'textarea' ? 'top-4 text-sm' : 'top-1/2 -translate-y-1/2 text-sm'
    const isRaised = value !== '' || ALWAYS_RAISED.includes(type)
    return (
      <div data-question="" className={wrapperClass}>
        <div className="relative">
          {control}
          {/* After the box, so it can follow the box's focus (peer); it moves, it never disappears. */}
          <label
            htmlFor={id}
            data-part="label"
            className={`pointer-events-none absolute left-3 font-medium transition-all duration-150 ${CO.muted} ${isRaised ? RAISED : `${resting} ${peerFocusRaise}`}`}
          >
            {labelText}
          </label>
        </div>
        {notes}
      </div>
    )
  }

  if (isInsetRow) {
    return (
      <div data-question="" className={wrapperClass}>
        <div className="flex items-center gap-3">
          {label}
          <div className="min-w-0 flex-1">{control}</div>
        </div>
        {(help || error) && <div className="pb-2">{notes}</div>}
      </div>
    )
  }

  return (
    <div data-question="" className={wrapperClass}>
      {label}
      {control}
      {notes}
    </div>
  )
}

/** Scroll to (and focus) the first question with a mistake after each failed tap. */
function useScrollToFirstMistake(attempt: number) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!attempt) return
    const question = rootRef.current?.querySelector('[data-field-error]')?.closest<HTMLElement>('[data-question]')
    if (!question) return
    if (typeof question.scrollIntoView === 'function') question.scrollIntoView({ block: 'center', behavior: 'smooth' })
    question.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true })
  }, [attempt])
  return rootRef
}

export function CheckoutFields({ checkout, columns = 2, showLoyalty = true, showSmsOptIn = true, look }: CheckoutFieldsProps) {
  const { formFields } = checkout
  const fieldErrors = checkout.fieldErrors ?? NO_ERRORS
  const reactId = useId()
  const rootRef = useScrollToFirstMistake(checkout.fieldErrorAttempt ?? 0)

  if (!formFields.length) return null

  const spec = fieldStyleSpec(look)
  const isList = !!spec.group
  const hasHalf = formFields.some((field) => readFieldRules(field.validation_rules).width === 'half')
  const gridColumns = columns === 2 || hasHalf ? 'md:grid-cols-2' : 'grid-cols-1'

  return (
    <div ref={rootRef} style={checkoutThemeStyle(checkout)}>
      <div className={isList ? spec.group : `grid gap-4 ${gridColumns}`}>
        {formFields.map((field) => (
          <CheckoutQuestion
            key={field.id}
            checkout={checkout}
            field={field}
            spec={spec}
            baseId={reactId}
            error={fieldErrors[field.field_name]}
            wrapperClass={isList ? (spec.row ?? '') : spanClass(field, renderableFieldType(field.field_type), columns, hasHalf)}
          />
        ))}
      </div>
      {/* The customer's own stamp card, the moment their number is complete.
          Above consent because it is feedback on the field they just filled. */}
      {showLoyalty && (
        <div className="mt-4">
          <CheckoutLoyaltyProgress checkout={checkout} />
        </div>
      )}

      {/* Consent sits below the fields, spanning both columns — it is a
          statement about all of them, not another field. */}
      {showSmsOptIn && <SmsOptInCheckbox checkout={checkout} />}
    </div>
  )
}
