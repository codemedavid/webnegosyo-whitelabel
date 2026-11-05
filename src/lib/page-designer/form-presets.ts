/**
 * "Add a question" in the Page Designer's form editor: ready-made questions
 * (with the stored names the rest of the platform already understands —
 * `customer_name`, `delivery_address`, `table_number` …) and one blank
 * question per kind.
 */

import { FIELD_TYPE_LABELS, TYPES_WITH_CHOICES, type CheckoutFieldType } from '@/lib/checkout-field-types'
import { DELIVERY_ADDRESS_FIELD_NAME, TABLE_NUMBER_FIELD_NAME } from '@/lib/checkout-field-presets'

import { makeTempId, type FormQuestion } from './form-changes'

export interface QuestionPreset {
  id: string
  label: string
  /** Why pick it, under the name in the menu. */
  hint?: string
  question: Omit<FormQuestion, 'id'>
}

const ask = (
  field_name: string,
  field_label: string,
  field_type: CheckoutFieldType,
  extra: Partial<Omit<FormQuestion, 'id'>> = {},
): Omit<FormQuestion, 'id'> => ({
  field_name,
  field_label,
  field_type,
  is_required: false,
  placeholder: '',
  options: [],
  validation_rules: {},
  ...extra,
})

export const QUESTION_PRESETS: readonly QuestionPreset[] = [
  { id: 'name', label: 'Name', question: ask('customer_name', 'Full Name', 'text', { is_required: true, placeholder: 'Enter your name' }) },
  { id: 'phone', label: 'Phone number', hint: 'Customers, loyalty and texts key on it', question: ask('customer_phone', 'Phone Number', 'phone', { is_required: true, placeholder: 'Enter your phone number' }) },
  { id: 'email', label: 'Email', question: ask('customer_email', 'Email', 'email', { placeholder: 'you@example.com' }) },
  {
    id: 'delivery_address',
    label: 'Delivery address',
    hint: 'Address search with a map pin; sets the delivery fee',
    question: ask(DELIVERY_ADDRESS_FIELD_NAME, 'Delivery Address', 'textarea', { is_required: true, placeholder: 'Enter your complete delivery address' }),
  },
  { id: 'table_number', label: 'Table number', hint: 'Prints on the kitchen ticket and receipt', question: ask(TABLE_NUMBER_FIELD_NAME, 'Table Number', 'text', { placeholder: 'e.g. 12' }) },
  { id: 'landmark', label: 'Landmark', question: ask('landmark', 'Landmark', 'text', { placeholder: 'e.g. Blue gate beside 7-Eleven' }) },
  {
    id: 'plate',
    label: 'Car plate number',
    hint: 'For curbside pickup',
    question: ask('plate_number', 'Car plate number', 'text', { placeholder: 'ABC 1234', validation_rules: { pattern: 'plate', help: 'So we can bring your order to your car.' } }),
  },
  { id: 'notes', label: 'Notes', question: ask('notes', 'Notes for the kitchen', 'textarea', { placeholder: 'Anything we should know?' }) },
  {
    id: 'heard_from',
    label: 'How did you hear about us?',
    question: ask('heard_from', 'How did you hear about us?', 'select', { options: ['Facebook', 'Instagram', 'TikTok', 'A friend', 'Walked by', 'Other'] }),
  },
]

/** One blank question per kind, in the pickers' order. */
export const BLANK_QUESTIONS: readonly QuestionPreset[] = (Object.keys(FIELD_TYPE_LABELS) as CheckoutFieldType[]).map((type) => ({
    id: `blank:${type}`,
    label: FIELD_TYPE_LABELS[type],
    question: ask('', type === 'checkbox' ? 'I agree' : 'New question', type, {
      options: TYPES_WITH_CHOICES.includes(type) ? ['Option 1', 'Option 2'] : [],
    }),
  }))

/** Ready-made questions this order type does not ask yet (each stored name once). */
export function availablePresets(questions: readonly Pick<FormQuestion, 'field_name'>[]): QuestionPreset[] {
  const taken = new Set(questions.map((q) => q.field_name))
  return QUESTION_PRESETS.filter((preset) => !taken.has(preset.question.field_name))
}

/** A new question from a preset, with a fresh temp id. */
export function questionFromPreset(preset: QuestionPreset): FormQuestion {
  return { ...preset.question, id: makeTempId(), options: [...preset.question.options], validation_rules: { ...preset.question.validation_rules } }
}
