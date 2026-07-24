/**
 * Canonical normalization for customer form fields captured at checkout.
 *
 * Every checkout write path (Messenger message, order snapshot, Supabase/Convex
 * order, QR handoff payload) funnels the raw `customerData` map through
 * `normalizeCustomerData` so the customer database is stored in one clean shape:
 * PH phones as E.164, emails lowercased/trimmed, names/addresses whitespace-
 * collapsed. Normalization is driven by each field's declared `field_type`, so a
 * tenant can name the field whatever they like and it still gets normalized.
 *
 * This is intentionally pure and side-effect free (immutable — always returns a
 * new object) so it can be shared and unit-tested in isolation. The stable
 * identity/dedupe key still comes from `resolveOrderContact` in customer-identity;
 * this module cleans the human-visible field values that sit alongside it.
 */
import { normalizePhoneE164 } from '@/lib/phone'
import type { CustomerFormField } from '@/types/database'

/** The subset of a form field this module needs to normalize a value. */
export type NormalizableField = Pick<CustomerFormField, 'field_name' | 'field_type'>

/** Trim ends and collapse every run of whitespace (spaces, tabs, newlines) to one space. */
function collapseWhitespace(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Normalize a phone number to E.164 (`+63XXXXXXXXXX`) when it can be confidently
 * recognized. If it cannot, keep a whitespace-collapsed copy rather than blanking
 * it — a merchant must never lose a number the customer actually typed.
 */
export function normalizePhoneField(raw: string): string {
  const e164 = normalizePhoneE164(raw)
  if (e164) return e164
  return collapseWhitespace(raw)
}

/** Lowercase and trim an email so the same address always keys identically. */
export function normalizeEmailField(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Trim and collapse internal whitespace for free-text fields (names, addresses). */
export function normalizeTextField(raw: string): string {
  return collapseWhitespace(raw)
}

/** Normalize a single value according to its form field's declared type. */
export function normalizeCustomerFieldValue(
  raw: string,
  fieldType: CustomerFormField['field_type']
): string {
  switch (fieldType) {
    case 'phone':
      return normalizePhoneField(raw)
    case 'email':
      return normalizeEmailField(raw)
    case 'text':
    case 'textarea':
    case 'select':
    case 'number':
      return collapseWhitespace(raw)
    default:
      return collapseWhitespace(raw)
  }
}

/**
 * Return a new `customerData` map with every declared form field normalized by
 * its type. Keys that are not declared form fields (e.g. `delivery_lat`,
 * `delivery_lng`, `scheduled_for`) are passed through untouched, and fields
 * absent from the data map are never invented as empty keys.
 */
export function normalizeCustomerData(
  customerData: Record<string, string>,
  formFields: NormalizableField[]
): Record<string, string> {
  const result: Record<string, string> = { ...customerData }

  for (const field of formFields) {
    const value = result[field.field_name]
    if (typeof value !== 'string') continue
    result[field.field_name] = normalizeCustomerFieldValue(value, field.field_type)
  }

  return result
}
