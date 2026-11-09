/**
 * The delivery address box follows the checkout theme: on a checkout it is
 * drawn with the same class as the other answer boxes (the chosen field
 * style) and the `--co-*` colours, marked as a Page Designer `field`; every
 * other caller (store location, branches, superadmin) keeps the standard
 * gray field, with no part marks.
 */

import { render, screen } from '@testing-library/react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'

// Render the real address field instead of next/dynamic's loading box.
jest.mock('next/dynamic', () => () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/shared/address-autocomplete').AddressAutocomplete
})

const STANDARD_GRAY = 'border-gray-300'

const originalToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
const originalProvider = process.env.NEXT_PUBLIC_MAPS_PROVIDER

beforeEach(() => {
  // Mapbox warns once per field when the deploy has no token (the plain box is the point here).
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = originalToken
  process.env.NEXT_PUBLIC_MAPS_PROVIDER = originalProvider
})

function addressBox(): HTMLInputElement {
  return screen.getByPlaceholderText('Search your street') as HTMLInputElement
}

async function renderStandalone(theme?: import('@/components/shared/address-autocomplete').AddressFieldTheme) {
  const { AddressAutocomplete } = await import('@/components/shared/address-autocomplete')
  return render(<AddressAutocomplete value="" onChange={jest.fn()} placeholder="Search your street" mapsEnabled={false} theme={theme} />)
}

async function renderCheckoutFields(style: 'outlined' | 'filled' | 'underlined') {
  const [{ CheckoutFields }, { buildSampleCheckout }] = await Promise.all([
    import('@/components/customer/checkout-templates/checkout-primitives'),
    import('@/components/page-designer/checkout/sample-checkout'),
  ])
  const sample = buildSampleCheckout(null)
  const checkout = {
    ...sample,
    tenant: { ...sample.tenant, mapbox_enabled: true },
    formFields: [
      { id: 'f-address', field_name: 'delivery_address', field_label: 'Address', field_type: 'text', is_required: true, placeholder: 'Search your street', options: null },
    ],
  } as unknown as UseCheckoutReturn
  return render(<CheckoutFields checkout={checkout} showLoyalty={false} showSmsOptIn={false} look={{ style, corners: 'auto' }} />)
}

describe('address field outside the checkout', () => {
  it.each(['mapbox', 'apple'])('keeps the standard gray box with no part marks (%s)', async (provider) => {
    process.env.NEXT_PUBLIC_MAPS_PROVIDER = provider
    const { container } = await renderStandalone()
    expect(addressBox().className).toContain(STANDARD_GRAY)
    expect(addressBox().className).toContain('focus:ring-orange-500')
    expect(container.querySelector('[data-part]')).toBeNull()
  })
})

describe('address field on the checkout', () => {
  it.each(['outlined', 'filled', 'underlined'] as const)('uses the answer boxes’ %s class and is a Page Designer field', async (style) => {
    const { fieldInputClass } = await import('@/components/customer/checkout-templates/field-styles')
    await renderCheckoutFields(style)
    const box = addressBox()
    expect(box).toHaveAttribute('data-part', 'field')
    expect(box.className).toContain(fieldInputClass({ style, corners: 'auto' }))
    expect(box.className).not.toContain(STANDARD_GRAY)
    expect(box.className).not.toContain('orange')
  })

  it('themes the map buttons too when maps are on', async () => {
    process.env.NEXT_PUBLIC_MAPS_PROVIDER = 'mapbox'
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = 'pk.test'
    const { container } = await renderCheckoutFields('outlined')
    const buttons = container.querySelectorAll('[data-part="button-alt"]')
    expect(buttons.length).toBe(2)
    buttons.forEach((button) => expect(button.className).toContain('bg-[var(--co-card)]'))
    expect(addressBox()).toHaveAttribute('data-part', 'field')
  })

  it('builds the theme from the checkout colours only', async () => {
    const { checkoutAddressTheme } = await import('@/components/customer/checkout-templates/checkout-address-field')
    const theme = checkoutAddressTheme('my-box')
    expect(theme.input).toBe('my-box')
    for (const [key, value] of Object.entries(theme)) {
      if (key === 'input') continue
      expect(value).toMatch(/var\(--co-/)
      expect(value).not.toMatch(/gray|orange|white|red-/)
    }
  })

  it('falls back to the standard answer box when given no class', async () => {
    const [{ checkoutAddressTheme }, { STANDARD_INPUT_CLASS }] = await Promise.all([
      import('@/components/customer/checkout-templates/checkout-address-field'),
      import('@/components/customer/checkout-templates/field-styles'),
    ])
    expect(checkoutAddressTheme('').input).toBe(STANDARD_INPUT_CLASS)
  })
})
