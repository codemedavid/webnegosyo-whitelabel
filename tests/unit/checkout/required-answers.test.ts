/**
 * The one "is this question answered?" rule, shared by the checkout form
 * (`validateCheckoutFields`) and `createOrderAction`.
 *
 * The browser judges what it is about to SEND (the normalized answer), and the
 * server judges what it RECEIVED, so the two can only disagree if the wire
 * changes an answer — which the parity property test rules out.
 */

import { describe, expect, it } from '@jest/globals'
import {
  ANSWER_KEYS_THE_SERVER_CANNOT_SEE,
  findMissingRequiredAnswers,
  isAnswered,
  missingAnswerMessage,
  type RequiredQuestion,
} from '@/lib/checkout/required-answers'

const question = (field_name: string, extra: Partial<RequiredQuestion> = {}): RequiredQuestion => ({
  field_name,
  field_label: `${field_name} label`,
  field_type: 'text',
  is_required: true,
  ...extra,
})

describe('isAnswered', () => {
  it('counts any non-blank text as an answer', () => {
    expect(isAnswered('text', 'Juan')).toBe(true)
    expect(isAnswered('phone', '+639171234567')).toBe(true)
    expect(isAnswered('textarea', ' x ')).toBe(true)
  })

  it('treats blank, whitespace, missing and non-string values as unanswered', () => {
    expect(isAnswered('text', '')).toBe(false)
    expect(isAnswered('text', '   \n\t')).toBe(false)
    expect(isAnswered('text', undefined)).toBe(false)
    expect(isAnswered('text', null)).toBe(false)
    expect(isAnswered('text', 12)).toBe(false)
    expect(isAnswered('text', true)).toBe(false)
  })

  it('answers a tick box only when it is ticked', () => {
    expect(isAnswered('checkbox', 'yes')).toBe(true)
    expect(isAnswered('checkbox', ' yes ')).toBe(true)
    expect(isAnswered('checkbox', '')).toBe(false)
    expect(isAnswered('checkbox', 'no')).toBe(false)
  })

  it('reads an unknown type as text (an older checkout asks it as a text box)', () => {
    expect(isAnswered('signature', 'drawn')).toBe(true)
    expect(isAnswered('signature', '')).toBe(false)
  })
})

describe('missingAnswerMessage', () => {
  it('says the same sentence the checkout form shows', () => {
    expect(missingAnswerMessage({ field_label: 'Name', field_type: 'text' })).toBe('Name is required')
    expect(missingAnswerMessage({ field_label: 'I am 18+', field_type: 'checkbox' })).toBe('Please tick “I am 18+”')
  })
})

describe('findMissingRequiredAnswers', () => {
  it('names every required question left blank, in form order', () => {
    const fields = [question('customer_name'), question('customer_phone', { field_type: 'phone' }), question('note')]
    expect(findMissingRequiredAnswers(fields, { customer_name: '  ', note: 'ok' })).toEqual([
      { fieldName: 'customer_name', message: 'customer_name label is required' },
      { fieldName: 'customer_phone', message: 'customer_phone label is required' },
    ])
  })

  it('ignores optional questions', () => {
    expect(findMissingRequiredAnswers([question('note', { is_required: false })], {})).toEqual([])
  })

  it('passes a fully answered form', () => {
    const fields = [question('customer_name'), question('agree', { field_type: 'checkbox' })]
    expect(findMissingRequiredAnswers(fields, { customer_name: 'Juan', agree: 'yes' })).toEqual([])
  })

  it('refuses an unticked required tick box', () => {
    const fields = [question('agree', { field_type: 'checkbox', field_label: 'No refunds' })]
    expect(findMissingRequiredAnswers(fields, { agree: '' })).toEqual([
      { fieldName: 'agree', message: 'Please tick “No refunds”' },
    ])
  })

  it('treats no answers at all as every required question missing', () => {
    expect(findMissingRequiredAnswers([question('customer_name')], undefined)).toHaveLength(1)
    expect(findMissingRequiredAnswers([question('customer_name')], null)).toHaveLength(1)
  })

  it('never reads an inherited property as an answer', () => {
    expect(findMissingRequiredAnswers([question('toString')], {})).toHaveLength(1)
  })

  it('skips questions whose answer can never reach the server intact', () => {
    // `pos` is stripped as server-owned; `scheduled_for` is overwritten by the
    // checkout's own schedule. Refusing on them would refuse a real customer.
    const fields = [question('pos'), question('scheduled_for'), question('messenger_psid'), question('sms_consent')]
    expect(findMissingRequiredAnswers(fields, {})).toEqual([])
    for (const field of fields) expect(ANSWER_KEYS_THE_SERVER_CANNOT_SEE.has(field.field_name)).toBe(true)
  })
})
