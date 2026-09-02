/**
 * Checkout form field presets.
 *
 * A checkout field is stored as a raw `field_type` (the `customer_form_fields`
 * CHECK constraint allows only text/email/phone/textarea/select/number), but
 * one field is special: the checkout renders the Mapbox address autocomplete —
 * and hangs the delivery-fee/radius logic off it — when the field is *named*
 * `delivery_address`. That convention was invisible in the admin, so deleting
 * the seeded field made the address widget unrecoverable through the UI.
 *
 * Presets put the convention in one place: the admin picker is built from this
 * list, and picking the address preset fills in the reserved internal name.
 */

import type { CustomerFormField } from '@/types/database'

export const DELIVERY_ADDRESS_FIELD_NAME = 'delivery_address'
export const DELIVERY_ADDRESS_PRESET_ID = 'delivery_address'

type FieldType = CustomerFormField['field_type']

/** The subset of a form field a preset can decide up front. */
export interface PresetFieldDefaults {
  field_name: string
  field_label: string
  field_type: FieldType
  placeholder: string
}

export interface CheckoutFieldPreset {
  /** Value used by the admin picker. Matches `field_type` for the plain types. */
  id: string
  /** Merchant-facing name of the choice. */
  label: string
  /** Short explanation shown under the picker, when the choice needs one. */
  description?: string
  /** Stored field type. Constrained to what the database accepts. */
  fieldType: FieldType
  /**
   * Internal name this preset locks in. Only set for presets whose behavior is
   * keyed on the name; free-form presets leave the merchant to choose.
   */
  reservedFieldName?: string
  defaultLabel?: string
  defaultPlaceholder?: string
}

export const CHECKOUT_FIELD_PRESETS: readonly CheckoutFieldPreset[] = [
  { id: 'text', label: 'Text', fieldType: 'text' },
  { id: 'email', label: 'Email', fieldType: 'email' },
  { id: 'phone', label: 'Phone', fieldType: 'phone' },
  { id: 'textarea', label: 'Textarea', fieldType: 'textarea' },
  { id: 'select', label: 'Select (Dropdown)', fieldType: 'select' },
  { id: 'number', label: 'Number', fieldType: 'number' },
  {
    id: DELIVERY_ADDRESS_PRESET_ID,
    label: 'Delivery Address',
    description:
      'Address autocomplete with map lookup. Required for delivery fees and the delivery radius check.',
    fieldType: 'textarea',
    reservedFieldName: DELIVERY_ADDRESS_FIELD_NAME,
    defaultLabel: 'Delivery Address',
    defaultPlaceholder: 'Enter your complete delivery address',
  },
]

export function getCheckoutFieldPreset(presetId: string): CheckoutFieldPreset | undefined {
  return CHECKOUT_FIELD_PRESETS.find((preset) => preset.id === presetId)
}

/** True when this field is the one the checkout renders as the address widget. */
export function isDeliveryAddressField(field: Pick<CustomerFormField, 'field_name'>): boolean {
  return field.field_name === DELIVERY_ADDRESS_FIELD_NAME
}

/** The preset an already-saved field came from (or behaves as). */
export function resolvePresetIdForField(
  field: Pick<CustomerFormField, 'field_name' | 'field_type'>
): string {
  if (isDeliveryAddressField(field)) return DELIVERY_ADDRESS_PRESET_ID
  return field.field_type
}

/** Field defaults for a freshly picked preset. */
export function buildFieldFromPreset(presetId: string): PresetFieldDefaults {
  const preset = getCheckoutFieldPreset(presetId)

  if (!preset) {
    throw new Error(`Unknown checkout field preset: ${presetId}`)
  }

  return {
    field_name: preset.reservedFieldName ?? '',
    field_label: preset.defaultLabel ?? '',
    field_type: preset.fieldType,
    placeholder: preset.defaultPlaceholder ?? '',
  }
}

/** Badge text for a saved field — names the behavior, not the storage type. */
export function getFieldBadgeLabel(
  field: Pick<CustomerFormField, 'field_name' | 'field_type'>
): string {
  const preset = getCheckoutFieldPreset(resolvePresetIdForField(field))
  return preset?.label ?? field.field_type
}

/**
 * Presets a merchant may still add. A reserved name can exist only once per
 * order type, so its preset drops out once the field is there.
 */
export function getAvailableFieldPresets(
  existingFields: readonly Pick<CustomerFormField, 'field_name'>[],
  currentFieldName?: string
): CheckoutFieldPreset[] {
  const takenNames = new Set(
    existingFields
      .map((field) => field.field_name)
      .filter((name) => name !== currentFieldName)
  )

  return CHECKOUT_FIELD_PRESETS.filter(
    (preset) => !preset.reservedFieldName || !takenNames.has(preset.reservedFieldName)
  )
}
