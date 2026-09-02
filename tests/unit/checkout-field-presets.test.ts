/**
 * Delivery address is a *preset*, not a free-form field.
 *
 * The checkout renders the Mapbox autocomplete (and the delivery-fee/radius
 * logic hangs off it) purely because the field is named `delivery_address` —
 * see `checkout-primitives.tsx`. Nothing in the admin ever offered that name,
 * so a merchant who deletes the seeded field can only get it back by guessing
 * the exact internal string. These tests pin the preset list the admin picker
 * is built from, and the round-trip that makes a picked preset render as the
 * real address widget.
 */

import {
  CHECKOUT_FIELD_PRESETS,
  DELIVERY_ADDRESS_FIELD_NAME,
  DELIVERY_ADDRESS_PRESET_ID,
  buildFieldFromPreset,
  getCheckoutFieldPreset,
  getFieldBadgeLabel,
  isDeliveryAddressField,
  resolvePresetIdForField,
} from '@/lib/checkout-field-presets'

describe('checkout field presets', () => {
  it('offers a delivery address choice alongside the plain input types', () => {
    // Arrange / Act
    const ids = CHECKOUT_FIELD_PRESETS.map((preset) => preset.id)

    // Assert
    expect(ids).toEqual(
      expect.arrayContaining(['text', 'email', 'phone', 'textarea', 'select', 'number'])
    )
    expect(ids).toContain(DELIVERY_ADDRESS_PRESET_ID)
  })

  it('labels the delivery address preset for merchants, not for developers', () => {
    const preset = getCheckoutFieldPreset(DELIVERY_ADDRESS_PRESET_ID)

    expect(preset?.label).toMatch(/delivery address/i)
  })

  it('builds a field the checkout recognises as the real address widget', () => {
    // Act
    const field = buildFieldFromPreset(DELIVERY_ADDRESS_PRESET_ID)

    // Assert — the name is what switches on the Mapbox autocomplete
    expect(field.field_name).toBe(DELIVERY_ADDRESS_FIELD_NAME)
    expect(isDeliveryAddressField(field)).toBe(true)
  })

  it('stores the address preset under a field_type the database accepts', () => {
    // The customer_form_fields CHECK constraint allows only these six values.
    const field = buildFieldFromPreset(DELIVERY_ADDRESS_PRESET_ID)

    expect(['text', 'email', 'phone', 'textarea', 'select', 'number']).toContain(field.field_type)
  })

  it('keeps the internal name free for every other preset', () => {
    const field = buildFieldFromPreset('textarea')

    expect(field.field_name).toBe('')
    expect(isDeliveryAddressField(field)).toBe(false)
  })

  it('resolves an existing seeded address field back to the address preset', () => {
    // The seeded row is field_type 'textarea' — only the name marks it as an address.
    const seeded = { field_name: 'delivery_address', field_type: 'textarea' as const }

    expect(resolvePresetIdForField(seeded)).toBe(DELIVERY_ADDRESS_PRESET_ID)
    expect(resolvePresetIdForField({ field_name: 'notes', field_type: 'textarea' })).toBe('textarea')
  })

  it('badges an address field as Delivery Address rather than Textarea', () => {
    expect(getFieldBadgeLabel({ field_name: 'delivery_address', field_type: 'textarea' }))
      .toMatch(/delivery address/i)
    expect(getFieldBadgeLabel({ field_name: 'notes', field_type: 'textarea' })).toBe('Textarea')
  })
})
