/**
 * When a checkout question counts as answered — ONE rule for the browser and
 * the server.
 *
 * The checkout form (`validateCheckoutFields`) refuses to submit while a
 * required question is blank, and `createOrderAction` refuses the same order
 * on the server, because a forged request or a tab opened before the owner
 * made a question required can reach it with the answer missing. Both call
 * `isAnswered`, on the same value: the browser judges the answer it is about
 * to SEND (normalized, see `customer-field-normalization.ts`), the server the
 * answer it RECEIVED. Presence survives the trip (normalizing never empties an
 * answer it was given as non-blank, and the server only truncates), which
 * `required-answers-parity.property.test.ts` proves over the real pipeline.
 *
 * Presence only. Format checks (phone, email, date, the owner's
 * `validation_rules`) stay in the browser: the server sees the normalized
 * answer (`+639…`, collapsed spaces), on which a length or digits rule would
 * disagree with what the customer was shown, and the white-label customer
 * app asks every question as plain text without them.
 *
 * Pure and client-safe.
 */

import { SERVER_OWNED_CUSTOMER_DATA_KEYS } from '@/lib/checkout/customer-data-guard'
import { CHECKBOX_TICKED } from '@/lib/checkout-field-types'
import { SMS_CONSENT_KEY } from '@/lib/sms-consent'

/** What a required-answer check needs from a `customer_form_fields` row. */
export interface RequiredQuestion {
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
 * Answers the server can never judge: `sanitizeCustomerData` strips the
 * server-owned keys, and the checkout writes its own values over the rest
 * after the form (Messenger id, the schedule, SMS consent). A store whose
 * question happens to use one of these names must not have every order
 * refused for it; the form still asks it.
 */
export const ANSWER_KEYS_THE_SERVER_CANNOT_SEE: ReadonlySet<string> = new Set<string>([
  ...SERVER_OWNED_CUSTOMER_DATA_KEYS,
  '__proto__',
  'constructor',
  'prototype',
  'messenger_psid',
  'scheduled_for',
  'scheduled_for_label',
  SMS_CONSENT_KEY,
  'sms_consent_at',
])

/**
 * Whether `value` answers a question of `fieldType`. A tick box answers only
 * by being ticked; anything else by being non-blank text. Anything that is
 * not a string (absent, null, a number a forged request sent) is unanswered.
 */
export function isAnswered(fieldType: string, value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return fieldType === 'checkbox' ? trimmed === CHECKBOX_TICKED : trimmed !== ''
}

/** The sentence the form shows beside a required question left unanswered. */
export function missingAnswerMessage(field: Pick<RequiredQuestion, 'field_label' | 'field_type'>): string {
  return field.field_type === 'checkbox' ? `Please tick “${field.field_label}”` : `${field.field_label} is required`
}

/** Several mistakes as one message, the way the checkout's toast lists them. */
export function describeFieldErrors(errors: readonly FieldValidationError[]): string {
  return errors.map((error) => error.message).join('\n')
}

function ownAnswer(answers: Readonly<Record<string, unknown>> | null | undefined, name: string): unknown {
  if (!answers || !Object.prototype.hasOwnProperty.call(answers, name)) return undefined
  return answers[name]
}

/**
 * The server's check: every required question of the order's type that the
 * received answers leave unanswered, in form order. Questions whose answer
 * cannot reach the server intact are skipped (see above).
 */
export function findMissingRequiredAnswers(
  fields: readonly RequiredQuestion[],
  answers: Readonly<Record<string, unknown>> | null | undefined,
): FieldValidationError[] {
  return fields
    .filter((field) => field.is_required && !ANSWER_KEYS_THE_SERVER_CANNOT_SEE.has(field.field_name))
    .filter((field) => !isAnswered(field.field_type, ownAnswer(answers, field.field_name)))
    .map((field) => ({ fieldName: field.field_name, message: missingAnswerMessage(field) }))
}
