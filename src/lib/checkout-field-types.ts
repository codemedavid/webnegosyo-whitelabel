/**
 * The kinds of checkout question a store can ask (`customer_form_fields.field_type`).
 *
 * The first six are as old as the table. `choice`, `checkbox` and `date` were
 * added on 2026-11-05 (migration 20261105130000 widens the CHECK). An older
 * checkout, the register and anything else that does not know a type asks it
 * as plain text, which is always safe: the answer is still stored as a string
 * under the field's own name.
 */

export const CHECKOUT_FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'number',
  'choice',
  'checkbox',
  'date',
] as const

export type CheckoutFieldType = (typeof CHECKOUT_FIELD_TYPES)[number]

/** What a ticked `checkbox` stores. Unticked stores nothing ('' / absent), so "required" means "must tick". */
export const CHECKBOX_TICKED = 'yes'

/** Types that take a list of choices from `options`. */
export const TYPES_WITH_CHOICES: readonly CheckoutFieldType[] = ['select', 'choice']

export function isCheckoutFieldType(value: unknown): value is CheckoutFieldType {
  return typeof value === 'string' && (CHECKOUT_FIELD_TYPES as readonly string[]).includes(value)
}

/** The type to draw a stored field as: anything unknown is a text box. */
export function renderableFieldType(value: unknown): CheckoutFieldType {
  return isCheckoutFieldType(value) ? value : 'text'
}

/** Merchant-facing names, in the order the pickers list them. */
export const FIELD_TYPE_LABELS: Readonly<Record<CheckoutFieldType, string>> = {
  text: 'Short answer',
  textarea: 'Long answer',
  phone: 'Phone number',
  email: 'Email',
  number: 'Number',
  select: 'Dropdown',
  choice: 'Buttons (pick one)',
  checkbox: 'Tick box (yes / no)',
  date: 'Date',
}
