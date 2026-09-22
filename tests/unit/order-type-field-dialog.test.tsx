/**
 * Reproducer: "the delivery address field is not able to add".
 *
 * The Add Field dialog only ever offered the six raw input types, so once the
 * seeded Delivery Address field was deleted the merchant could not recreate the
 * address widget — typing a label produced a plain textarea. Picking the
 * Delivery Address choice must produce a field named `delivery_address`, which
 * is what makes the checkout render the Mapbox autocomplete + delivery fee.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldDialog } from '@/components/admin/order-types/field-dialog'

const createCustomerFormFieldAction = jest.fn()

jest.mock('@/app/actions/order-types', () => ({
  updateOrderTypeAction: jest.fn(),
  deleteOrderTypeAction: jest.fn(),
  createCustomerFormFieldAction: (...args: unknown[]) => createCustomerFormFieldAction(...args),
  updateCustomerFormFieldAction: jest.fn(),
  deleteCustomerFormFieldAction: jest.fn(),
  reorderCustomerFormFieldsAction: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

// Radix Select drives itself with Pointer Events, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn(() => false)
  Element.prototype.setPointerCapture = jest.fn()
  Element.prototype.releasePointerCapture = jest.fn()
  Element.prototype.scrollIntoView = jest.fn()
})

function renderDialog(existingFields: unknown[] = []) {
  return render(
    <FieldDialog
      open
      onOpenChange={jest.fn()}
      field={null}
      orderTypeId="ot-1"
      tenantId="tenant-1"
      tenantSlug="island-silog"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingFields={existingFields as any}
      onSuccess={jest.fn()}
    />
  )
}

async function pickDeliveryAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /field type/i }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', { name: /delivery address/i }))
}

describe('Add Form Field dialog — delivery address', () => {
  beforeEach(() => {
    createCustomerFormFieldAction.mockReset()
    createCustomerFormFieldAction.mockResolvedValue({ success: true, data: {} })
  })

  it('offers Delivery Address as a field type', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('combobox', { name: /field type/i }))
    const listbox = await screen.findByRole('listbox')

    expect(within(listbox).getByRole('option', { name: /delivery address/i })).toBeInTheDocument()
  })

  it('creates the field under the internal name the checkout looks for', async () => {
    const user = userEvent.setup()
    renderDialog()

    await pickDeliveryAddress(user)
    await user.click(screen.getByRole('button', { name: /add field/i }))

    expect(createCustomerFormFieldAction).toHaveBeenCalled()
    const input = createCustomerFormFieldAction.mock.calls[0][3]
    expect(input).toMatchObject({
      field_name: 'delivery_address',
      field_type: 'textarea',
    })
    expect(input.field_label).toMatch(/delivery address/i)
  })

  it('does not make the merchant type the internal name', async () => {
    const user = userEvent.setup()
    renderDialog()

    await pickDeliveryAddress(user)

    // The reserved name is filled in and locked — guessing it was the old trap.
    const nameInput = screen.getByLabelText(/internal name/i) as HTMLInputElement
    expect(nameInput.value).toBe('delivery_address')
    expect(nameInput).toBeDisabled()
  })

  it('refuses a second delivery address field on the same order type', async () => {
    const user = userEvent.setup()
    renderDialog([
      { id: 'f-1', field_name: 'delivery_address', field_label: 'Delivery Address', field_type: 'textarea', order_index: 0 },
    ])

    await user.click(screen.getByRole('combobox', { name: /field type/i }))
    const listbox = await screen.findByRole('listbox')

    expect(within(listbox).queryByRole('option', { name: /delivery address/i })).not.toBeInTheDocument()
  })
})
