/**
 * Arriving from the chat's Checkout button loads the Messenger cart: an empty
 * web cart is filled, a full one is asked about, a second arrival with the
 * same dishes adds nothing, and an expired link says so.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const TOKEN = `mt1.1893456000.0b0c9d3c-1111-4000-8000-000000000001.${'a'.repeat(43)}`
let params = new URLSearchParams(`mc=1&m=${TOKEN}`)
const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => params,
  usePathname: () => '/karamotan/cart',
  useRouter: () => ({ replace }),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a), info: (...a: unknown[]) => toast.info(...a) } }))

const cart = {
  messengerPsid: null as string | null,
  isHydrated: true,
  items: [] as unknown[],
  bundleItems: [] as unknown[],
  orderType: 'pickup' as string | null,
  addItem: jest.fn(() => ({ ok: true })),
  clearCart: jest.fn(),
  setOrderType: jest.fn(),
}
jest.mock('@/hooks/useCart', () => ({ useCart: () => cart }))

import { MessengerCartImport } from '@/components/customer/messenger-cart-import'

const DISH = { id: 'chicken', tenant_id: 't1', name: 'Chicken Inasal', price: 149 }

function respond(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch
}

beforeEach(() => {
  params = new URLSearchParams(`mc=1&m=${TOKEN}`)
  cart.items = []
  cart.addItem.mockClear()
  cart.clearCart.mockClear()
  cart.setOrderType.mockClear()
  replace.mockClear()
  Object.values(toast).forEach((fn) => fn.mockClear())
})

it('fills an empty cart with the chat dishes, with the link token, and drops the marker from the URL', async () => {
  respond(200, { items: [{ menuItem: DISH, quantity: 2 }] })
  render(<MessengerCartImport tenantId="t1" />)
  await waitFor(() => expect(cart.addItem).toHaveBeenCalledWith(DISH, undefined, [], 2))
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ tenantId: 't1', token: TOKEN })
  expect(replace).toHaveBeenCalledWith(`/karamotan/cart?m=${TOKEN}`, { scroll: false })
  expect(toast.success).toHaveBeenCalledWith('Added 1 dish from Messenger')
})

it('a cart with other dishes asks; Replace keeps the chosen order type', async () => {
  cart.items = [{ id: 'x', menu_item: { id: 'pork' }, quantity: 1, selected_addons: [] }]
  respond(200, { items: [{ menuItem: DISH, quantity: 1 }] })
  render(<MessengerCartImport tenantId="t1" />)
  await screen.findByText('Use your Messenger cart?')
  expect(cart.addItem).not.toHaveBeenCalled()
  await act(async () => { await userEvent.click(screen.getByText('Replace my cart')) })
  expect(cart.clearCart).toHaveBeenCalled()
  expect(cart.setOrderType).toHaveBeenCalledWith('pickup')
  expect(cart.addItem).toHaveBeenCalledWith(DISH, undefined, [], 1)
})

it('arriving again with the same dishes already in the cart adds nothing', async () => {
  cart.items = [{ id: 'x', menu_item: { id: 'chicken' }, quantity: 2, selected_addons: [] }]
  respond(200, { items: [{ menuItem: DISH, quantity: 2 }] })
  render(<MessengerCartImport tenantId="t1" />)
  await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(cart.addItem).not.toHaveBeenCalled()
  expect(screen.queryByText('Use your Messenger cart?')).toBeNull()
})

it('an expired link says so and adds nothing', async () => {
  respond(403, { error: 'expired' })
  render(<MessengerCartImport tenantId="t1" />)
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('expired')))
  expect(cart.addItem).not.toHaveBeenCalled()
})

it('does nothing without the marker', () => {
  params = new URLSearchParams(`m=${TOKEN}`)
  respond(200, { items: [] })
  render(<MessengerCartImport tenantId="t1" />)
  expect(global.fetch).not.toHaveBeenCalled()
})
