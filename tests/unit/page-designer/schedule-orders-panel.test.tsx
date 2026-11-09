/**
 * The Schedule block shows only on order types with pre-orders on. Its Content
 * panel says which those are and switches them, keeping the choice when the
 * block is deselected and putting it back when the store refused it.
 */

import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { CheckoutFormProvider } from '@/components/page-designer/editor/form-editor/form-context'
import { ScheduleOrdersPanel } from '@/components/page-designer/editor/form-editor/schedule-orders-panel'
import { useCheckoutFormSession } from '@/components/page-designer/editor/form-editor/use-checkout-form-session'
import type { CheckoutFormSource } from '@/lib/page-designer/form-changes'
import { toggleOrderTypeAdvanceOrderAction } from '@/app/actions/order-types'

jest.mock('@/app/actions/order-types', () => ({ toggleOrderTypeAdvanceOrderAction: jest.fn() }))
jest.mock('@/app/actions/page-designer', () => ({ saveCheckoutFormAction: jest.fn() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const toggle = toggleOrderTypeAdvanceOrderAction as jest.Mock

const source = (isDeliveryOn: boolean): CheckoutFormSource => ({
  orderTypes: [
    { id: 'o-delivery', name: 'Delivery', type: 'delivery', description: null, isEnabled: true, advanceOrderEnabled: isDeliveryOn, isOnWeb: true },
    { id: 'o-other', name: 'Shopee Food', type: 'other', description: null, isEnabled: true, advanceOrderEnabled: false, isOnWeb: true },
    { id: 'o-grab', name: 'Grab', type: 'grab', description: null, isEnabled: true, advanceOrderEnabled: false, isOnWeb: false },
    { id: 'o-hidden', name: 'Dine In', type: 'dine_in', description: null, isEnabled: false, advanceOrderEnabled: false, isOnWeb: true },
  ],
  saved: { 'o-delivery': [], 'o-other': [], 'o-grab': [], 'o-hidden': [] },
})

function setup(isDeliveryOn = true) {
  const session = renderHook(() => useCheckoutFormSession('t1', 'seacook', source(isDeliveryOn)))
  const panel = (): ReactNode => (
    <CheckoutFormProvider value={session.result.current.context}>
      <ScheduleOrdersPanel />
    </CheckoutFormProvider>
  )
  const view = render(panel())
  return { session, refresh: () => view.rerender(panel()) }
}

const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  window.localStorage.clear()
  toggle.mockReset()
  toggle.mockResolvedValue({ success: true })
  ;(toast.error as jest.Mock).mockReset()
})

it('lists only the order types customers can pick here, with their real state', () => {
  setup()
  expect(screen.getByRole('switch', { name: 'Pre-orders for Delivery' })).toBeChecked()
  expect(screen.getByRole('switch', { name: 'Pre-orders for Shopee Food' })).not.toBeChecked()
  expect(screen.queryByRole('switch', { name: 'Pre-orders for Dine In' })).not.toBeInTheDocument()
  expect(screen.queryByRole('switch', { name: 'Pre-orders for Grab' })).not.toBeInTheDocument()
})

it('warns when no order type offers it', () => {
  setup(false)
  expect(screen.getByRole('status')).toHaveTextContent(/customers never see this block/i)
})

it('switches the order type on the store and remembers it', async () => {
  const { session, refresh } = setup()
  await act(async () => session.result.current.context.onToggleAdvanceOrder('o-other', true))
  refresh()
  expect(toggle).toHaveBeenCalledWith('o-other', 't1', 'seacook', true)
  expect(screen.getByRole('switch', { name: 'Pre-orders for Shopee Food' })).toBeChecked()
})

it('puts the switch back and says so when the store refused it', async () => {
  toggle.mockResolvedValue({ success: false, error: 'No permission' })
  const { session, refresh } = setup()
  await act(async () => session.result.current.context.onToggleAdvanceOrder('o-other', true))
  await flush()
  refresh()
  expect(screen.getByRole('switch', { name: 'Pre-orders for Shopee Food' })).not.toBeChecked()
  expect(toast.error).toHaveBeenCalledWith('No permission')
})
