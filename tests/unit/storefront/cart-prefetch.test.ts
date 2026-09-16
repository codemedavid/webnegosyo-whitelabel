import { act, renderHook } from '@testing-library/react'
import { useCartCheckout } from '@/storefront/cart/use-cart-checkout'
import { getCheckoutUpsellsAction } from '@/app/actions/menu-engineering'
import type { CartItem, MenuItem, Tenant } from '@/types/database'

const mockRouter = { push: jest.fn(), prefetch: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('@/app/actions/menu-engineering', () => ({ getCheckoutUpsellsAction: jest.fn() }))
const fetchUpsells = jest.mocked(getCheckoutUpsellsAction)
const tenant = { id: 'tenant-1', menu_engineering_enabled: true, checkout_upsell_enabled: true } as Tenant
const items = [{ id: 'line-1', menu_item: { id: 'dish-1' } }] as CartItem[]
const options = { tenant, tenantSlug: 'cafe', enabled: true, hasItems: true, items }
const suggestions = [{ id: 'suggestion-1' }] as MenuItem[]

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); fetchUpsells.mockResolvedValue({ success: true, data: suggestions }) })
afterEach(() => jest.useRealTimers())

test('an old tenant request cannot replace current tenant suggestions', async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof getCheckoutUpsellsAction>>) => void
  fetchUpsells.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
  const { result, rerender } = renderHook((props) => useCartCheckout(props), { initialProps: options })
  await act(async () => { jest.advanceTimersByTime(500) })
  rerender({ ...options, tenant: { ...tenant, id: 'tenant-2' }, tenantSlug: 'new-cafe' })
  await act(async () => { jest.advanceTimersByTime(500) })
  expect(result.current.prefetchedItems).toEqual(suggestions)
  await act(async () => { resolveOld({ success: true, data: [{ id: 'old-suggestion' }] as MenuItem[] }) })
  expect(result.current.prefetchedItems).toEqual(suggestions)
})

test('changing cart contents immediately hides suggestions fetched for the previous contents', async () => {
  const { result, rerender } = renderHook((props) => useCartCheckout(props), { initialProps: options })
  await act(async () => { jest.advanceTimersByTime(500) })
  expect(result.current.prefetchedItems).toEqual(suggestions)
  rerender({ ...options, items: [{ id: 'line-2', menu_item: { id: 'dish-2' } }] as CartItem[] })
  expect(result.current.prefetchedItems).toBeNull()
})

test('unmount clears the checkout safety timer while router navigation is pending', async () => {
  mockRouter.push.mockImplementationOnce(() => new Promise(() => {}))
  const { result, unmount } = renderHook(() => useCartCheckout({ ...options, enabled: false }))
  act(() => { void result.current.navigateToCheckout() })
  expect(result.current.isNavigating).toBe(true)
  expect(jest.getTimerCount()).toBe(1)
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})
