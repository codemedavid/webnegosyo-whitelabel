import { z } from 'zod'
import { cssColorString, cssValueString } from '@/lib/css-value-schema'
import { VALID_DB_COLUMNS } from '@/lib/product-detail-settings-utils'
import { PRODUCT_DETAIL_FIELD_INDEX } from '@/lib/product-detail-registry'

/**
 * Write schema for `product_detail_settings`, derived from the column list
 * (VALID_DB_COLUMNS) and the Studio field registry so a new column cannot be
 * saved unvalidated:
 *
 * - registry `color` fields → the same CSS color rule tenant branding uses;
 * - customer-facing labels → bounded plain text (rendered as React text);
 * - every other string column is a CSS value (sizes, radii, gradients, font
 *   stacks, shadows) → bounded, no declaration-ending characters;
 * - `enable_animations` boolean, `animation_speed` enum;
 * - `mobile_overrides` → each value validated by its own column's schema.
 *
 * `tenant_id` is deliberately absent: the action sets it from the authorized
 * tenant, and a payload value must never redirect the upsert.
 */

const LABEL_COLUMNS: ReadonlySet<string> = new Set([
  'variation_required_text',
  'variation_optional_text',
  'addon_optional_text',
  'addon_price_free_text',
  'footer_empty_summary_text',
  'buy_now_button_label',
  'add_to_cart_button_label',
])
const MAX_LABEL_LENGTH = 200
const MAX_COLOR_LENGTH = 100
const ANIMATION_SPEEDS = ['slow', 'normal', 'fast'] as const
const EXCLUDED_COLUMNS: ReadonlySet<string> = new Set(['tenant_id', 'mobile_overrides'])

function columnSchema(column: string): z.ZodType {
  if (column === 'enable_animations') return z.boolean()
  if (column === 'animation_speed') return z.enum(ANIMATION_SPEEDS)
  if (LABEL_COLUMNS.has(column)) return z.string().max(MAX_LABEL_LENGTH)
  if (PRODUCT_DETAIL_FIELD_INDEX[column]?.type === 'color') return cssColorString().max(MAX_COLOR_LENGTH)
  return cssValueString()
}

const COLUMN_SCHEMAS: Readonly<Record<string, z.ZodType>> = Object.fromEntries(
  [...VALID_DB_COLUMNS].filter((column) => !EXCLUDED_COLUMNS.has(column)).map((column) => [column, columnSchema(column)]),
)

type OverrideValue = string | number | boolean | null

/**
 * Unknown keys are dropped (legacy); `tenant_id`/`mobile_overrides` are refused;
 * every other key must pass its column's schema.
 */
const productMobileOverridesSchema = z.record(z.string(), z.unknown()).transform((overrides, ctx) => {
  const clean: Record<string, OverrideValue> = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (EXCLUDED_COLUMNS.has(key)) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'cannot be overridden per device' })
      continue
    }
    const schema = Object.prototype.hasOwnProperty.call(COLUMN_SCHEMAS, key) ? COLUMN_SCHEMAS[key] : null
    if (!schema) continue
    if (value === null) {
      clean[key] = null
      continue
    }
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', path: [key], message: parsed.error.issues[0]?.message ?? 'is invalid' })
      continue
    }
    clean[key] = parsed.data as OverrideValue
  }
  return clean
})

const columnShape = Object.fromEntries(
  Object.entries(COLUMN_SCHEMAS).map(([column, schema]) => [column, schema.nullable().optional()]),
)

/** Unknown keys (id, created_at, stale client fields) are stripped by z.object. */
export const productDetailSettingsWriteSchema = z.object({
  ...columnShape,
  mobile_overrides: productMobileOverridesSchema.nullable().optional(),
})

export type ProductDetailSettingsWrite = z.infer<typeof productDetailSettingsWriteSchema>
