/**
 * Checkout form validation.
 *
 * Checkout used to check only that required fields were non-blank. A phone
 * number the storefront accepted but the identity layer could not normalize
 * (e.g. `0987654322`, one digit short) produced a saved order whose customer
 * never appeared in the merchant's Customers list — the data was lost at the
 * point of entry, with nothing to recover later.
 *
 * So format checks here deliberately reuse `normalizePhoneE164`, the SAME
 * function the customer-identity layer uses. That equivalence is the point: if
 * a number would not survive capture, the customer is asked to fix it while
 * they are still on the page, instead of silently going missing.
 */
import { normalizePhoneE164 } from '@/lib/phone'
import { readFieldRules, ruleError } from '@/lib/checkout-field-rules'
import { normalizeFormFieldValue, type NormalizableField } from '@/lib/customer-field-normalization'
import { isAnswered, missingAnswerMessage, type FieldValidationError } from '@/lib/checkout/required-answers'

export type { FieldValidationError } from '@/lib/checkout/required-answers'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The subset of a configured form field that validation needs. */
export interface ValidatableField {
  field_name: string
  field_label: string
  field_type: string
  is_required: boolean
  /** The question's checks (min/max length, digits, pattern…); read through `readFieldRules`. */
  validation_rules?: unknown
}

/**
 * Validate submitted checkout values against their configured fields.
 *
 * Returns EVERY problem rather than stopping at the first, so the customer can
 * fix the whole form in one pass. An empty array means the form is good to
 * submit. Optional fields are only format-checked when actually filled in.
 */
export function validateCheckoutFields(
  fields: ValidatableField[],
  data: Record<string, string>
): FieldValidationError[] {
  const errors: FieldValidationError[] = []

  for (const field of fields) {
    const raw = data[field.field_name]
    const value = typeof raw === 'string' ? raw.trim() : ''

    // Answered or not is judged on what the order will CARRY (the normalized
    // answer), with the same `isAnswered` createOrderAction runs on what it
    // receives, so the server can never refuse an answer this form accepted.
    // A tick box answers only by being ticked: "must tick" = required.
    if (!isAnswered(field.field_type, sentAnswer(field, raw))) {
      if (field.is_required) errors.push({ fieldName: field.field_name, message: missingAnswerMessage(field) })
      // Unanswered optional question: nothing to format-check.
      continue
    }
    if (field.field_type === 'checkbox') continue

    const message = formatError(field, value) ?? ruleError(field.field_label, field.field_type, readFieldRules(field.validation_rules), value)
    if (message) errors.push({ fieldName: field.field_name, message })
  }

  return errors
}

/** The answer as the checkout will send it (see normalizeCustomerData). */
function sentAnswer(field: ValidatableField, raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return normalizeFormFieldValue(field as NormalizableField, raw)
}

/** Format rule for a filled-in value, or null when the value is acceptable. */
function formatError(field: ValidatableField, value: string): string | null {
  if (field.field_type === 'phone' && !normalizePhoneE164(value)) {
    return `${field.field_label} doesn’t look like a valid mobile number (example: 09171234567)`
  }

  if (field.field_type === 'email' && !EMAIL_RE.test(value.toLowerCase())) {
    return `${field.field_label} doesn’t look like a valid email address`
  }

  if (field.field_type === 'date' && !isCalendarDate(value)) {
    return `${field.field_label} should be a date`
  }

  return null
}

/** `YYYY-MM-DD` that names a real day (what a date box sends). */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** The first mistake per question, keyed by field name (what the form shows beside each box). */
export function fieldErrorMap(errors: readonly FieldValidationError[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const error of errors) if (!(error.fieldName in map)) map[error.fieldName] = error.message
  return map
}
