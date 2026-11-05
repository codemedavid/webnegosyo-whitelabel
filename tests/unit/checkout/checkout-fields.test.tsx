/**
 * The checkout's question form: each mistake beside its question (marked
 * `error`, wired with aria-invalid / aria-describedby, scrolled to), help
 * under the box (`muted`), half / full width, the new kinds (buttons, tick
 * box, date; unknown = text), and every field style rendering its boxes as
 * `field` and its questions as `label` — a floating label moves, never goes.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'

import { CheckoutFields } from '@/components/customer/checkout-templates/checkout-primitives'
import { fieldInputClass } from '@/components/customer/checkout-templates/field-styles'
import { buildSampleCheckout } from '@/components/page-designer/checkout/sample-checkout'
import { FIELD_STYLES, type FieldStyle } from '@/lib/page-designer/checkout-block-options'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('@/hooks/use-loyalty-progress', () => ({
  useLoyaltyProgress: () => ({ offer: null, card: null, isLoading: false, error: null, refresh: jest.fn() }),
}))

// Render the real address field instead of next/dynamic's loading box.
jest.mock('next/dynamic', () => () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/shared/address-autocomplete').AddressAutocomplete
})

type Field = Record<string, unknown>

const ask = (id: string, overrides: Field = {}): Field => ({
  id,
  field_name: id,
  field_label: `Q ${id}`,
  field_type: 'text',
  is_required: false,
  placeholder: '',
  options: null,
  validation_rules: {},
  ...overrides,
})

function makeCheckout(fields: Field[], overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  const sample = buildSampleCheckout(null)
  return {
    ...sample,
    tenant: { ...sample.tenant, lalamove_market: 'US' },
    formFields: fields,
    customerData: {},
    setCustomerData: jest.fn(),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

/** setCustomerData is called with an updater: run it to see the new answers. */
function lastAnswers(checkout: UseCheckoutReturn): Record<string, string> {
  const calls = jest.mocked(checkout.setCustomerData).mock.calls
  const update = calls[calls.length - 1][0] as (prev: Record<string, string>) => Record<string, string>
  return update({})
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => jest.restoreAllMocks())

describe('mistakes beside their questions', () => {
  it('shows nothing until a failed tap, then each mistake beside its box', () => {
    const fields = [ask('name', { field_label: 'Name', is_required: true }), ask('notes', { field_label: 'Notes' })]
    const { rerender } = render(<CheckoutFields checkout={makeCheckout(fields)} showLoyalty={false} showSmsOptIn={false} />)
    expect(screen.getByLabelText(/Name/)).not.toHaveAttribute('aria-invalid')
    expect(document.querySelector('[data-field-error]')).toBeNull()

    const scrollIntoView = jest.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    rerender(
      <CheckoutFields
        checkout={makeCheckout(fields, { fieldErrors: { name: 'Name is required' }, fieldErrorAttempt: 1 })}
        showLoyalty={false}
        showSmsOptIn={false}
      />,
    )
    const box = screen.getByLabelText(/^Name/)
    const message = screen.getByText('Name is required')
    expect(message).toHaveAttribute('data-part', 'error')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box.getAttribute('aria-describedby')).toContain(message.id)
    expect(screen.getByLabelText('Notes')).not.toHaveAttribute('aria-invalid')
    // Scrolled to and focused on the first mistake.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(document.activeElement).toBe(box)
  })

  it('shows help under the box, described to screen readers', () => {
    render(
      <CheckoutFields
        checkout={makeCheckout([ask('plate', { field_label: 'Plate', validation_rules: { help: 'So we can find your car' } })])}
        showLoyalty={false}
        showSmsOptIn={false}
      />,
    )
    const help = screen.getByText('So we can find your car')
    expect(help).toHaveAttribute('data-part', 'muted')
    expect(screen.getByLabelText('Plate').getAttribute('aria-describedby')).toBe(help.id)
  })
})

describe('width', () => {
  const spanOf = (label: string) => screen.getByLabelText(label).closest('[data-question]') as HTMLElement

  it('two columns: standard keeps today’s spans, full spans the row, half shares it', () => {
    render(
      <CheckoutFields
        checkout={makeCheckout([
          ask('a', { field_label: 'A' }),
          ask('b', { field_label: 'B', validation_rules: { width: 'full' } }),
          ask('c', { field_label: 'C', field_type: 'textarea' }),
          ask('d', { field_label: 'D', field_type: 'textarea', validation_rules: { width: 'half' } }),
        ])}
        showLoyalty={false}
        showSmsOptIn={false}
      />,
    )
    expect(spanOf('A').className).not.toContain('md:col-span-2')
    expect(spanOf('B').className).toContain('md:col-span-2')
    expect(spanOf('C').className).toContain('md:col-span-2')
    expect(spanOf('D').className).not.toContain('md:col-span-2')
  })

  it('one column: half-width questions still pair up on wider screens', () => {
    const { container } = render(
      <CheckoutFields
        checkout={makeCheckout([ask('a', { field_label: 'A', validation_rules: { width: 'half' } }), ask('b', { field_label: 'B' })])}
        columns={1}
        showLoyalty={false}
        showSmsOptIn={false}
      />,
    )
    expect(container.querySelector('.grid')?.className).toContain('md:grid-cols-2')
    expect(spanOf('A').className).not.toContain('md:col-span-2')
    expect(spanOf('B').className).toContain('md:col-span-2')
  })

  it('one column without half questions stays one column', () => {
    const { container } = render(<CheckoutFields checkout={makeCheckout([ask('a', { field_label: 'A' })])} columns={1} showLoyalty={false} showSmsOptIn={false} />)
    expect(container.querySelector('.grid')?.className).toContain('grid-cols-1')
  })
})

describe('kinds of answer', () => {
  it('buttons: one choice, marked as options, the picked one on', () => {
    const checkout = makeCheckout([ask('size', { field_label: 'Size', field_type: 'choice', options: ['Small', 'Large'] })], { customerData: { size: 'Large' } })
    render(<CheckoutFields checkout={checkout} showLoyalty={false} showSmsOptIn={false} />)
    const group = screen.getByRole('radiogroup', { name: 'Size' })
    const large = within(group).getByRole('radio', { name: 'Large' })
    expect(large).toBeChecked()
    expect(large.closest('[data-part="option"]')).toHaveAttribute('data-on', '')
    fireEvent.click(within(group).getByRole('radio', { name: 'Small' }))
    expect(lastAnswers(checkout)).toEqual({ size: 'Small' })
  })

  it('tick box: ticked stores "yes", unticked stores nothing', () => {
    const checkout = makeCheckout([ask('agree', { field_label: 'I agree', field_type: 'checkbox', is_required: true })], { customerData: { agree: 'yes' } })
    render(<CheckoutFields checkout={checkout} showLoyalty={false} showSmsOptIn={false} />)
    const box = screen.getByRole('checkbox', { name: /I agree/ })
    expect(box).toBeChecked()
    fireEvent.click(box)
    expect(lastAnswers(checkout)).toEqual({ agree: '' })
    expect(screen.getByText('I agree').closest('[data-part="label"]')).not.toBeNull()
  })

  it('date: a native date box', () => {
    render(<CheckoutFields checkout={makeCheckout([ask('when', { field_label: 'Event date', field_type: 'date' })])} showLoyalty={false} showSmsOptIn={false} />)
    expect(screen.getByLabelText('Event date')).toHaveAttribute('type', 'date')
  })

  it('an unknown kind is a text box', () => {
    render(<CheckoutFields checkout={makeCheckout([ask('x', { field_label: 'Mystery', field_type: 'hologram' })])} showLoyalty={false} showSmsOptIn={false} />)
    expect(screen.getByLabelText('Mystery')).toHaveAttribute('type', 'text')
  })
})

describe('field styles', () => {
  const FORM = [
    ask('name', { field_label: 'Name', is_required: true, placeholder: 'Your name' }),
    ask('phone', { field_label: 'Phone', field_type: 'phone' }),
    ask('notes', { field_label: 'Notes', field_type: 'textarea' }),
    ask('size', { field_label: 'Size', field_type: 'choice', options: ['S', 'L'] }),
    ask('agree', { field_label: 'Agree', field_type: 'checkbox' }),
    ask('delivery_address', { field_label: 'Address', field_type: 'textarea', placeholder: 'Search your street' }),
  ]
  const styles = FIELD_STYLES.map((s) => s.value)

  it('appends the eight new styles after the three existing ones (stored values never renamed)', () => {
    expect(styles.slice(0, 3)).toEqual(['outlined', 'filled', 'underlined'])
    expect(styles.slice(3)).toEqual(['floating', 'floating_filled', 'inset', 'joined', 'pill', 'elevated', 'chunky', 'kiosk'])
  })

  it.each(styles)('%s: every box is a field, every question keeps a visible label, the address follows the style', (style) => {
    const checkout = makeCheckout(FORM, { fieldErrors: { name: 'Name is required' }, fieldErrorAttempt: 0 })
    const { container } = render(
      <CheckoutFields checkout={checkout} showLoyalty={false} showSmsOptIn={false} look={{ style: style as FieldStyle, corners: 'auto' }} />,
    )
    for (const label of ['Name', 'Phone', 'Notes']) {
      const box = screen.getByLabelText(new RegExp(`^${label}`))
      expect(box).toHaveAttribute('data-part', 'field')
    }
    expect(screen.getByRole('radiogroup', { name: /Size/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Agree/ })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-part="label"]').length).toBeGreaterThanOrEqual(FORM.length)
    expect(screen.getByText('Name is required')).toHaveAttribute('data-part', 'error')
    const address = screen.getByPlaceholderText('Search your street')
    expect(address).toHaveAttribute('data-part', 'field')
    expect(address.className).toContain(fieldInputClass({ style: style as FieldStyle, corners: 'auto' }).split(' ').slice(0, 3).join(' '))
    // Only theme colours in the boxes' classes (the root sets the --co-* values).
    const classes = Array.from(container.querySelectorAll('[class]'), (el) => el.getAttribute('class')).join(' ')
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })

  it('floating: the label sits in the box and rises once there is an answer', () => {
    const look = { style: 'floating' as const, corners: 'auto' as const }
    const { rerender } = render(<CheckoutFields checkout={makeCheckout([FORM[0]])} showLoyalty={false} showSmsOptIn={false} look={look} />)
    const label = () => document.querySelector('label[data-part="label"]') as HTMLElement
    expect(label().className).toContain('top-1/2')
    expect(label().className).toContain('peer-focus:top-2')
    rerender(<CheckoutFields checkout={makeCheckout([FORM[0]], { customerData: { name: 'Maria' } })} showLoyalty={false} showSmsOptIn={false} look={look} />)
    expect(label().className).toContain('top-2')
    expect(label().className).not.toContain('top-1/2')
    expect(label()).toBeVisible()
  })

  it('inset and joined: one rounded group of rows', () => {
    for (const style of ['inset', 'joined'] as const) {
      const { container, unmount } = render(<CheckoutFields checkout={makeCheckout(FORM.slice(0, 2))} showLoyalty={false} showSmsOptIn={false} look={{ style, corners: 'auto' }} />)
      const group = container.querySelector('[data-question]')?.parentElement as HTMLElement
      expect(group.className).toContain('rounded-xl')
      expect(group.className).not.toContain('grid')
      unmount()
    }
  })

  it('pill: a leading icon by kind', () => {
    const { container } = render(<CheckoutFields checkout={makeCheckout([FORM[0], FORM[2]])} showLoyalty={false} showSmsOptIn={false} look={{ style: 'pill', corners: 'auto' }} />)
    expect(container.querySelectorAll('svg[aria-hidden]').length).toBe(2)
    expect(screen.getByLabelText(/^Name/).className).toContain('pl-11')
  })
})
