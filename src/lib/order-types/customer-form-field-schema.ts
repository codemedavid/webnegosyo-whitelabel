/**
 * One checkout question as the order-type service writes it. Pure (no
 * server imports) so the Page Designer's form editor can check a draft in the
 * browser with the exact schema the server applies.
 */

import { z } from 'zod'

import { CHECKOUT_FIELD_TYPES } from '@/lib/checkout-field-types'

/** Generous bounds: they stop junk, not any real store's form. */
export const FORM_FIELD_LIMITS = {
  name: 64,
  label: 200,
  placeholder: 200,
  options: 100,
  optionLength: 200,
  /** Serialized `validation_rules`. */
  rulesBytes: 4000,
} as const

export const customerFormFieldSchema = z.object({
  field_name: z.string().min(1, 'Field name is required').max(FORM_FIELD_LIMITS.name),
  field_label: z.string().trim().min(1, 'Field label is required').max(FORM_FIELD_LIMITS.label),
  field_type: z.enum(CHECKOUT_FIELD_TYPES),
  is_required: z.boolean(),
  placeholder: z.string().max(FORM_FIELD_LIMITS.placeholder).optional(),
  validation_rules: z
    .record(z.string(), z.unknown())
    .refine((rules) => JSON.stringify(rules).length <= FORM_FIELD_LIMITS.rulesBytes, 'These settings are too long')
    .optional(),
  options: z.array(z.string().max(FORM_FIELD_LIMITS.optionLength)).max(FORM_FIELD_LIMITS.options).optional(),
  order_index: z.number().int().min(0),
})

export type CustomerFormFieldInput = z.infer<typeof customerFormFieldSchema>
