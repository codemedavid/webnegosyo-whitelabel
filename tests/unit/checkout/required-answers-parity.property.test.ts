/**
 * Browser ⇄ server parity for required checkout questions.
 *
 * The checkout form refuses to submit while a required question is blank
 * (`validateCheckoutFields`), and `createOrderAction` now refuses the same
 * order on the server (`findMissingRequiredAnswers`). The server only sees
 * what survived the trip: the browser normalizes every answer, adds its own
 * keys (Messenger id, schedule, SMS consent), and the server sanitizes the
 * blob. These properties run that REAL pipeline and prove:
 *
 *  1. an order the form lets through is never refused by the server, and
 *  2. for every question the server can see, both sides call the same
 *     questions unanswered — the server rule is the browser rule.
 */

import { describe, it, expect } from '@jest/globals'
import fc from 'fast-check'
import { propertyParameters } from '../../utils/property'
import { validateCheckoutFields, type ValidatableField } from '@/lib/checkout-field-validation'
import {
  ANSWER_KEYS_THE_SERVER_CANNOT_SEE,
  findMissingRequiredAnswers,
  missingAnswerMessage,
} from '@/lib/checkout/required-answers'
import { normalizeCustomerData } from '@/lib/customer-field-normalization'
import { scheduleCustomerFields } from '@/lib/checkout/order-submit-fields'
import { withSmsConsent } from '@/lib/sms-consent'
import { sanitizeCustomerData } from '@/lib/checkout/customer-data-guard'
import type { CustomerFormField } from '@/types/database'

const FIELD_NAMES = [
  'customer_name', 'customer_phone', 'delivery_address', 'table_number', 'Contact Number',
  'agree', 'pickup_date', 'note', 'plate', 'pos', 'discount', 'scheduled_for',
  'scheduled_for_label', 'messenger_psid', 'sms_consent', 'sms_consent_at', 'delivery_store_note',
] as const

const FIELD_TYPES = ['text', 'email', 'phone', 'textarea', 'select', 'number', 'choice', 'checkbox', 'date', 'legacy-kind'] as const

const ANSWERS = [
  '', ' ', '\n\t', 'Juan', '  Juan  dela  Cruz ', 'Table', 'Table Table', 'T. T.', '#', 'tbl. 4', 'Table 12',
  'yes', ' yes ', 'Yes', 'no', '0917 123 4567', '+639171234567', '0987', 'a@b.co', 'A@B.CO ', '2026-11-10',
  '2026-02-30', 'ABC 1234', '12', '-3', 'x'.repeat(2500),
]

const fieldArb = fc.record({
  field_type: fc.constantFrom(...FIELD_TYPES),
  is_required: fc.boolean(),
  validation_rules: fc.option(
    fc.record({
      minLength: fc.option(fc.integer({ min: 1, max: 40 }), { nil: undefined }),
      maxLength: fc.option(fc.integer({ min: 1, max: 40 }), { nil: undefined }),
      digitsOnly: fc.option(fc.constant(true), { nil: undefined }),
      pattern: fc.option(fc.constant('plate'), { nil: undefined }),
    }),
    { nil: undefined },
  ),
})

const formArb = fc
  .uniqueArray(fc.constantFrom(...FIELD_NAMES), { minLength: 1, maxLength: FIELD_NAMES.length })
  .chain((names) =>
    fc.tuple(
      fc.tuple(...names.map(() => fieldArb)).map((shapes) =>
        names.map((name, index) => ({ ...shapes[index], field_name: name, field_label: `${name} label` })),
      ),
      fc.tuple(...names.map(() => fc.option(fc.oneof(fc.constantFrom(...ANSWERS), fc.string()), { nil: undefined }))),
    ),
  )
  .map(([fields, values]) => ({
    fields: fields as Array<ValidatableField & { field_type: string }>,
    raw: Object.fromEntries(
      fields.flatMap((field, index) => (values[index] === undefined ? [] : [[field.field_name, values[index] as string]])),
    ) as Record<string, string>,
  }))

const extrasArb = fc.record({
  psid: fc.option(fc.constantFrom('psid-1', ''), { nil: undefined }),
  scheduledISO: fc.option(fc.constant('2026-11-10T04:00:00.000Z'), { nil: null }),
  scheduledLabel: fc.option(fc.constantFrom('Mon 12:00 PM', ''), { nil: null }),
  smsOptIn: fc.boolean(),
})

/** Exactly what useCheckout sends and createOrderAction keeps (handleCheckout → sanitizeCustomerData). */
function receivedByServer(
  fields: readonly ValidatableField[],
  raw: Record<string, string>,
  extras: { psid?: string; scheduledISO: string | null; scheduledLabel: string | null; smsOptIn: boolean },
): Record<string, unknown> | undefined {
  const normalized = normalizeCustomerData(raw, fields as unknown as CustomerFormField[])
  const sent = withSmsConsent(
    {
      ...normalized,
      ...(extras.psid ? { messenger_psid: extras.psid } : {}),
      ...scheduleCustomerFields(extras.scheduledISO, extras.scheduledLabel),
    },
    extras.smsOptIn,
    '2026-11-10T00:00:00.000Z',
  )
  const sanitized = sanitizeCustomerData(sent)
  if (!sanitized.ok) throw new Error(sanitized.error)
  return sanitized.data
}

describe('required checkout questions: browser and server agree', () => {
  it('never refuses on the server an order the checkout form let through', () => {
    fc.assert(
      fc.property(formArb, extrasArb, ({ fields, raw }, extras) => {
        fc.pre(validateCheckoutFields(fields, raw).length === 0)
        const received = receivedByServer(fields, raw, extras)
        expect(findMissingRequiredAnswers(fields, received)).toEqual([])
      }),
      propertyParameters(),
    )
  })

  it('calls the same questions unanswered on both sides', () => {
    fc.assert(
      fc.property(formArb, extrasArb, ({ fields, raw }, extras) => {
        const browserMissing = validateCheckoutFields(fields, raw)
          .filter((error) => {
            const field = fields.find((candidate) => candidate.field_name === error.fieldName)
            return field !== undefined && error.message === missingAnswerMessage(field)
          })
          .map((error) => error.fieldName)
          .filter((name) => !ANSWER_KEYS_THE_SERVER_CANNOT_SEE.has(name))

        const serverMissing = findMissingRequiredAnswers(fields, receivedByServer(fields, raw, extras)).map(
          (error) => error.fieldName,
        )
        expect(serverMissing).toEqual(browserMissing)
      }),
      propertyParameters(),
    )
  })

  it('judges a table answer on what is sent: "Table" alone is no table', () => {
    const fields = [{ field_name: 'table_number', field_label: 'Table', field_type: 'text', is_required: true }]
    expect(validateCheckoutFields(fields, { table_number: 'Table' })).toEqual([
      { fieldName: 'table_number', message: 'Table is required' },
    ])
    expect(validateCheckoutFields(fields, { table_number: 'Table 12' })).toEqual([])
  })
})
