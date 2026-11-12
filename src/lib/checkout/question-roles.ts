/**
 * Which checkout questions mean the customer's name, phone, delivery address
 * or table, whatever the store called them. Stores that rebuilt their form
 * used words like "Contact Number" or "Full name" instead of the seeded
 * `customer_name` / `customer_phone` / `delivery_address`.
 *
 * Two readers:
 *   - the register (`webnegosyo-app/lib/pos-checkout-fields.ts` keeps its own
 *     copy, pinned to this one by `question-roles-parity.test.ts`) maps these
 *     onto its own controls instead of asking twice;
 *   - the customer app's order path answers name / phone / address questions
 *     from the signed-in session and the picked place, under the question's
 *     OWN name, so the store's required check and order screen see them.
 *
 * Pure and client-safe.
 */

import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'

export type QuestionRole = 'name' | 'phone' | 'address' | 'table' | 'custom'

export const QUESTION_ROLE_ALIASES: Readonly<Record<Exclude<QuestionRole, 'custom'>, readonly string[]>> = {
  name: ['customer name', 'name', 'full name', 'customer'],
  phone: [
    'customer phone',
    'phone',
    'phone number',
    'contact',
    'contact number',
    'contact no',
    'mobile',
    'mobile number',
    'cellphone number',
  ],
  address: ['delivery address', 'address', 'complete address', 'complete delivery address'],
  table: ['table number', 'table', 'table no'],
}

/** "Contact Number " → "contact number"; "customer_phone" → "customer phone". */
export function normalizeQuestionName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function questionRole(fieldName: string): QuestionRole {
  if (fieldName === DELIVERY_ADDRESS_FIELD_NAME) return 'address'
  const normalized = normalizeQuestionName(fieldName)
  for (const [role, aliases] of Object.entries(QUESTION_ROLE_ALIASES)) {
    if (aliases.includes(normalized)) return role as QuestionRole
  }
  return 'custom'
}
