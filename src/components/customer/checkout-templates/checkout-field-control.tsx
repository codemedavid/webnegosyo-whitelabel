'use client'

/**
 * The answer control of one checkout question, by its kind: text, long
 * answer, dropdown, buttons (`choice`), tick box, date, number, email and
 * the PH phone box. Anything unknown is a text box. The question's label,
 * help and mistake are drawn around it by `CheckoutFields` (and Classic).
 */

import type { LucideIcon } from 'lucide-react'

import { CHECKBOX_TICKED, renderableFieldType } from '@/lib/checkout-field-types'
import { PH_PHONE_MAX_DIGITS, phPhoneDigitCount, phPhoneDisplayDigits, toPhPhoneValue } from '@/lib/checkout/customer-field-input'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

import { CO } from './checkout-theme'

export type CheckoutFormField = UseCheckoutReturn['formFields'][number]

export interface FieldControlProps {
  checkout: UseCheckoutReturn
  field: CheckoutFormField
  id: string
  /** The answer box's class (from the field style). */
  boxClass: string
  /** A textarea's box, when it differs. */
  textareaClass?: string
  /** The question label's id, for controls labelled by it (buttons); absent = named by the question text. */
  labelId?: string
  /** Ids of the help / mistake lines. */
  describedBy?: string
  isInvalid: boolean
  /** Pill style: the leading icon. */
  icon?: LucideIcon
}

/** True for a PH store's phone question (the +63 box). */
export function isPhPhoneField(checkout: UseCheckoutReturn, field: CheckoutFormField): boolean {
  return field.field_type === 'phone' && (checkout.tenant?.lalamove_market || '').toUpperCase() === 'PH'
}

const CHOICE_ON = 'border-[color:var(--co-accent)] bg-[var(--co-accent)] text-[color:var(--co-accent-text)]'
const CHOICE_OFF = 'border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)] hover:bg-[var(--co-subtle)]'

function a11yOf(isInvalid: boolean, describedBy: string | undefined) {
  return {
    ...(isInvalid ? { 'aria-invalid': true as const } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
  }
}

export function CheckoutFieldControl({ checkout, field, id, boxClass, textareaClass, labelId, describedBy, isInvalid, icon: Icon }: FieldControlProps) {
  const { customerData, setCustomerData } = checkout
  const value = customerData[field.field_name] || ''
  const setValue = (next: string) => setCustomerData((prev) => ({ ...prev, [field.field_name]: next }))
  const a11y = a11yOf(isInvalid, describedBy)
  const type = renderableFieldType(field.field_type)
  const withIcon = (control: React.ReactNode, isTall = false) =>
    Icon ? (
      <div className="relative">
        <Icon aria-hidden data-part="muted" className={`pointer-events-none absolute left-4 h-4 w-4 ${isTall ? 'top-3.5' : 'top-1/2 -translate-y-1/2'} ${CO.muted}`} />
        {control}
      </div>
    ) : (
      control
    )
  const iconPad = Icon ? ' pl-11' : ''

  if (type === 'textarea') {
    return withIcon(
      <textarea
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={field.placeholder}
        data-part="field"
        className={`${textareaClass ?? boxClass}${iconPad}`}
        rows={3}
        {...a11y}
      />,
      true,
    )
  }

  if (type === 'select') {
    return (
      <select id={id} value={value} onChange={(e) => setValue(e.target.value)} data-part="field" className={boxClass} {...a11y}>
        <option value="">Select {field.field_label}</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    )
  }

  if (type === 'choice') {
    return (
      <div
        role="radiogroup"
        {...(labelId ? { 'aria-labelledby': labelId } : { 'aria-label': field.field_label })}
        className="flex flex-wrap gap-2"
        {...a11y}
      >
        {(field.options ?? []).map((option) => {
          const isOn = value === option
          return (
            <label
              key={option}
              data-part="option"
              data-on={isOn ? '' : undefined}
              className={`cursor-pointer select-none rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-[color:var(--co-accent)] ${isOn ? CHOICE_ON : CHOICE_OFF}`}
            >
              <input type="radio" name={id} value={option} checked={isOn} onChange={() => setValue(option)} className="sr-only" />
              {option}
            </label>
          )
        })}
      </div>
    )
  }

  if (type === 'checkbox') {
    return (
      <input
        id={id}
        type="checkbox"
        checked={value === CHECKBOX_TICKED}
        onChange={(e) => setValue(e.target.checked ? CHECKBOX_TICKED : '')}
        className={`mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded ${CO.border}`}
        style={{ accentColor: 'var(--co-accent)' }}
        {...a11y}
      />
    )
  }

  if (isPhPhoneField(checkout, field)) {
    return (
      <div className="relative">
        <div data-part="muted" className={`absolute left-3 top-1/2 -translate-y-1/2 font-medium pointer-events-none ${CO.text}`}>
          +63
        </div>
        <input
          id={id}
          type="tel"
          value={phPhoneDisplayDigits(value)}
          onChange={(e) => setValue(toPhPhoneValue(e.target.value))}
          placeholder="9XXXXXXXXX"
          maxLength={PH_PHONE_MAX_DIGITS}
          data-part="field"
          className={`${boxClass} pl-12`}
          {...a11y}
        />
        <div data-part="muted" className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${CO.muted}`}>
          {`${phPhoneDigitCount(value)}/${PH_PHONE_MAX_DIGITS}`}
        </div>
      </div>
    )
  }

  const inputType = type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'
  return withIcon(
    <input
      id={id}
      type={inputType}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={field.placeholder}
      data-part="field"
      className={`${boxClass}${iconPad}`}
      {...a11y}
    />,
  )
}
