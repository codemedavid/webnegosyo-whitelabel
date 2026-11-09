/**
 * The kinds of checkout question are listed once (checkout-field-types.ts);
 * the database CHECK (migration 20261105130000), the service schema and the
 * generated row type must accept exactly those, so a kind the editor offers
 * can always be saved.
 */

import { readFileSync } from 'fs'

import { CHECKOUT_FIELD_TYPES, renderableFieldType } from '@/lib/checkout-field-types'
import { customerFormFieldSchema } from '@/lib/order-types/customer-form-field-schema'
import { CHECKOUT_FIELD_PRESETS } from '@/lib/checkout-field-presets'

const MIGRATION = 'supabase/migrations/20261105130000_customer_form_field_types.sql'

it('the migration’s CHECK lists every kind, the old six included', () => {
  const sql = readFileSync(MIGRATION, 'utf8')
  const list = /check \(field_type in \(([^)]*)\)\)/.exec(sql)?.[1] ?? ''
  const kinds = list.split(',').map((s) => s.trim().replace(/'/g, ''))
  expect(kinds.sort()).toEqual([...CHECKOUT_FIELD_TYPES].sort())
  expect(sql).toMatch(/drop constraint if exists customer_form_fields_field_type_check/)
})

it('the service schema accepts every kind and nothing else', () => {
  const base = { field_name: 'q', field_label: 'Q', is_required: false, order_index: 0 }
  for (const field_type of CHECKOUT_FIELD_TYPES) expect(customerFormFieldSchema.safeParse({ ...base, field_type }).success).toBe(true)
  expect(customerFormFieldSchema.safeParse({ ...base, field_type: 'signature' }).success).toBe(false)
})

it('the admin picker offers the three new kinds', () => {
  const offered = CHECKOUT_FIELD_PRESETS.map((p) => p.fieldType)
  for (const kind of ['choice', 'checkbox', 'date']) expect(offered).toContain(kind)
})

it('an unknown stored kind is drawn as text', () => {
  expect(renderableFieldType('signature')).toBe('text')
  expect(renderableFieldType(null)).toBe('text')
  expect(renderableFieldType('date')).toBe('date')
})
