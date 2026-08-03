/**
 * The SMS opt-in at checkout.
 *
 * This is the only place consent is ever captured. Until it renders, every
 * customer row on the platform carries `sms_consent = false`, the merchant
 * app's audience selection correctly returns nobody, and the whole follow-up
 * feature is inert — so the tests here are less about the checkbox itself and
 * more about the two things that would silently break it:
 *
 *  1. The value must leave as a real boolean. Checkout form values are
 *     `Record<string, string>`, so routing consent through the normal field
 *     path would store the string "true", which both read sites reject.
 *  2. Every checkout design must show it. Four designs compose
 *     `CheckoutFields`; Classic deliberately does not, and would silently
 *     collect no consent if it were forgotten.
 */

import fs from 'fs'
import path from 'path'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckoutFields, SmsOptInCheckbox } from '@/components/customer/checkout-templates/checkout-primitives'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CustomerFormField } from '@/types/database'

const PHONE_FIELD = {
  id: 'f-phone',
  field_name: 'customer_phone',
  field_label: 'Mobile number',
  field_type: 'phone',
  is_required: true,
  sort_order: 0,
} as unknown as CustomerFormField

const setIsSmsOptedIn = jest.fn()

const checkoutWith = (overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn =>
  ({
    formFields: [PHONE_FIELD],
    customerData: {},
    setCustomerData: jest.fn(),
    tenant: { id: 't-1', slug: 'acme', name: 'Acme' },
    branding: {},
    isSmsOptedIn: false,
    setIsSmsOptedIn,
    ...overrides,
  }) as unknown as UseCheckoutReturn

beforeEach(() => {
  setIsSmsOptedIn.mockClear()
})

describe('SmsOptInCheckbox', () => {
  it('starts unchecked, so consent is never assumed', () => {
    // A pre-ticked box is not consent under the Data Privacy Act, and it is
    // the single easiest way for this feature to become indefensible.
    render(<SmsOptInCheckbox checkout={checkoutWith()} />)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('reports the opt-in as a boolean true, not the string "true"', () => {
    // The whole reason consent bypasses the customerData form-field path.
    render(<SmsOptInCheckbox checkout={checkoutWith()} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(setIsSmsOptedIn).toHaveBeenCalledWith(true)
    expect(typeof setIsSmsOptedIn.mock.calls[0][0]).toBe('boolean')
  })

  it('reflects a consent already given', () => {
    render(<SmsOptInCheckbox checkout={checkoutWith({ isSmsOptedIn: true } as Partial<UseCheckoutReturn>)} />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('can be withdrawn once ticked', () => {
    render(<SmsOptInCheckbox checkout={checkoutWith({ isSmsOptedIn: true } as Partial<UseCheckoutReturn>)} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(setIsSmsOptedIn).toHaveBeenCalledWith(false)
  })

  it('says what the customer is agreeing to', () => {
    // "Subscribe" or a bare checkbox is not informed consent; the label has to
    // name the channel and the purpose.
    render(<SmsOptInCheckbox checkout={checkoutWith()} />)

    expect(screen.getByRole('checkbox')).toHaveAccessibleName(/text|sms/i)
  })
})

describe('CheckoutFields — where the four shared designs pick it up', () => {
  it('renders the opt-in alongside the customer fields', () => {
    render(<CheckoutFields checkout={checkoutWith()} />)

    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('renders nothing at all when the tenant collects no customer fields', () => {
    // No fields means no phone number, so there is nothing to consent about.
    const { container } = render(<CheckoutFields checkout={checkoutWith({ formFields: [] })} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('every checkout design reaches the opt-in', () => {
  // Classic renders its own fields verbatim rather than composing
  // CheckoutFields, so it is the one design that can silently miss this.
  const TEMPLATES = ['classic', 'modern', 'wizard', 'minimal', 'express']

  it.each(TEMPLATES)('%s checkout renders a consent path', (name) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/customer/checkout-templates', `${name}-checkout.tsx`),
      'utf8'
    )

    expect(source).toMatch(/SmsOptInCheckbox|CheckoutFields/)
  })
})
