/**
 * Creating an order type — the aggregator kinds.
 *
 * Grab, foodpanda and "Other" join the picker. The core three still vanish
 * once used; the repeatable kinds stay offered no matter what the store has,
 * so "Shopee Food" and "Lalamove Market" can both be `other` rows. Other has
 * no name to prefill, so the merchant must type one.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createOrderTypeAction = jest.fn()
jest.mock('@/app/actions/order-types', () => ({
  createOrderTypeAction: (...args: unknown[]) => createOrderTypeAction(...args),
}))

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn(), back: jest.fn() }),
}))

const toastError = jest.fn()
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: (...a: unknown[]) => toastError(...a), warning: jest.fn() },
}))

async function renderCreate(usedTypes: string[]) {
  const { OrderTypeCreate } = await import('@/components/admin/order-type-create')
  return render(
    <OrderTypeCreate
      tenantSlug="island-silog"
      tenantId="tenant-1"
      usedTypes={usedTypes}
      existingOrderTypesCount={usedTypes.length}
    />
  )
}

beforeEach(() => {
  createOrderTypeAction.mockReset()
  createOrderTypeAction.mockResolvedValue({ success: true, data: { id: 'ot-new' } })
  toastError.mockClear()
})

describe('OrderTypeCreate — kinds', () => {
  it('still offers Grab, foodpanda and Other when the core three exist', async () => {
    await renderCreate(['dine_in', 'pickup', 'delivery'])

    expect(screen.getByRole('button', { name: /grab/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /foodpanda/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /other/i })).toBeEnabled()
    expect(screen.queryByText(/all order types have been created/i)).not.toBeInTheDocument()
  })

  it('hides a core kind once the store has it', async () => {
    await renderCreate(['pickup'])

    expect(screen.queryByRole('button', { name: /pick up/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dine in/i })).toBeInTheDocument()
  })

  it('keeps offering Grab even when the store already has a Grab row', async () => {
    await renderCreate(['grab'])

    expect(screen.getByRole('button', { name: /grab/i })).toBeEnabled()
  })

  it('prefills the name for Grab', async () => {
    const user = userEvent.setup()
    await renderCreate([])

    await user.click(screen.getByRole('button', { name: /grab/i }))

    expect(screen.getByLabelText(/display name/i)).toHaveValue('Grab')
  })

  it('leaves the name blank for Other and asks for one', async () => {
    const user = userEvent.setup()
    await renderCreate([])

    await user.click(screen.getByRole('button', { name: /other/i }))

    const name = screen.getByLabelText(/display name/i)
    expect(name).toHaveValue('')
    expect(name).toHaveAttribute('placeholder', 'e.g. Shopee Food')
  })

  it('refuses to create an Other row without a name', async () => {
    const user = userEvent.setup()
    await renderCreate([])

    await user.click(screen.getByRole('button', { name: /other/i }))
    await user.click(screen.getByRole('button', { name: /create order type/i }))

    expect(createOrderTypeAction).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  it('sends the chosen kind to the action', async () => {
    const user = userEvent.setup()
    await renderCreate([])

    await user.click(screen.getByRole('button', { name: /foodpanda/i }))
    await user.click(screen.getByRole('button', { name: /create order type/i }))

    expect(createOrderTypeAction).toHaveBeenCalled()
    expect(createOrderTypeAction.mock.calls[0][2]).toMatchObject({ type: 'foodpanda', name: 'foodpanda' })
  })
})
