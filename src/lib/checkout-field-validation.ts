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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The subset of a configured form field that validation needs. */
export interface ValidatableField {
  field_name: string
  field_label: string
  field_type: string
  is_required: boolean
}

export interface FieldValidationError {
  fieldName: string
  message: string
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
    const value = data[field.field_name]?.trim() ?? ''

    if (value === '') {
      if (field.is_required) {
        errors.push({
          fieldName: field.field_name,
          message: `${field.field_label} is required`,
        })
      }
      // Blank optional field: nothing to format-check.
      continue
    }

    const message = formatError(field, value)
    if (message) errors.push({ fieldName: field.field_name, message })
  }

  return errors
}

/** Format rule for a filled-in value, or null when the value is acceptable. */
function formatError(field: ValidatableField, value: string): string | null {
  if (field.field_type === 'phone' && !normalizePhoneE164(value)) {
    return `${field.field_label} doesn’t look like a valid mobile number (example: 09171234567)`
  }

  if (field.field_type === 'email' && !EMAIL_RE.test(value.toLowerCase())) {
    return `${field.field_label} doesn’t look like a valid email address`
  }

  return null
}
