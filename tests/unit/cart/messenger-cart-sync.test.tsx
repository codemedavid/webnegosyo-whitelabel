/**
 * The website cart tells the customer's Messenger chat only about changes the
 * customer makes on the website.
 *
 * Found on the live test Page (2026-11-21): a chat order (Add to cart in
 * Messenger → Checkout → place the order) put three stray lines in the chat:
 * "Your cart at Sample Demo: 2 items" right after the chat's cart arrived on
 * the website, then "Your cart at Sample Demo is empty" after the order
 * summary, and again on every later page load with the Messenger link.
 */

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import type { MenuItem } from '@/types/database'
import { webCartSyncStep } from '@/lib/messenger/web-cart-sync'

jest.mock('next/navigation', () => ({
  usePathname: () => '/test-store/menu',
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const TOKEN = `mt1.1893456000.0b0c9d3c-1111-4000-8000-000000000001.${'a'.repeat(43)}`
const SYNC_WAIT_MS = 5_500

const fries: MenuItem = {
  id: 'fries', tenant_id: 'tenant-1', category_id: 'c-1', name: 'Fries', description: '',
  price: 80, image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
  variations: [], addons: [],
}

const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }))

function cartMessages(): Array<{ items: Array<{ itemId?: string; quantity: number }> }> {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
    .filter(([url]) => url === '/api/messenger/send-cart')
    .map(([, init]) => JSON.parse(String(init.body)))
}

async function renderCart() {
  // Imported lazily: next/jest leaves static imports ahead of jest.mock.
  const { CartProvider, useCart } = await import('@/hooks/useCart')
  const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>
  return renderHook(() => useCart(), { wrapper })
}

async function waitForSync() {
  await act(async () => {
    jest.advanceTimersByTime(SYNC_WAIT_MS)
    await Promise.resolve()
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  localStorage.clear()
  localStorage.setItem('tenant_context', JSON.stringify({ tenantId: 'tenant-1', tenantSlug: 'test-store' }))
  localStorage.setItem('messenger_psid', TOKEN)
  fetchMock.mockClear()
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => jest.useRealTimers())

describe('webCartSyncStep', () => {
  it('adopts the first look and quiet changes, sends only a real change', () => {
    expect(webCartSyncStep({ cartHash: '[]', lastKnown: null, isQuiet: false, canSend: true })).toBe('adopt')
    expect(webCartSyncStep({ cartHash: '[1]', lastKnown: '[]', isQuiet: true, canSend: true })).toBe('adopt')
    expect(webCartSyncStep({ cartHash: '[1]', lastKnown: '[1]', isQuiet: false, canSend: true })).toBe('skip')
    expect(webCartSyncStep({ cartHash: '[1]', lastKnown: '[]', isQuiet: false, canSend: false })).toBe('skip')
    expect(webCartSyncStep({ cartHash: '[1]', lastKnown: '[]', isQuiet: false, canSend: true })).toBe('send')
  })
})

describe('useCart → Messenger chat', () => {
  it('opening a page with the Messenger link and an empty cart sends nothing', async () => {
    await renderCart()
    await waitForSync()
    expect(cartMessages()).toEqual([])
  })

  it('a dish the customer adds on the website still reaches the chat', async () => {
    const { result } = await renderCart()
    act(() => { result.current.addItem(fries, undefined, [], 2) })
    await waitForSync()
    expect(cartMessages()).toHaveLength(1)
    expect(cartMessages()[0].items).toEqual([expect.objectContaining({ itemId: 'fries', quantity: 2 })])
  })

  it("the chat's own cart arriving on the website is not echoed back", async () => {
    const { result } = await renderCart()
    act(() => {
      result.current.skipNextMessengerSync()
      result.current.addItem(fries, undefined, [], 2)
    })
    await waitForSync()
    expect(cartMessages()).toEqual([])

    // A change the customer makes afterwards is theirs, and is sent.
    act(() => { result.current.updateQuantity(result.current.items[0].id, 3) })
    await waitForSync()
    expect(cartMessages()).toHaveLength(1)
  })

  it('emptying the cart after the order is placed sends nothing', async () => {
    const { result } = await renderCart()
    act(() => { result.current.addItem(fries, undefined, [], 1) })
    await waitForSync()
    expect(cartMessages()).toHaveLength(1)

    act(() => { result.current.clearCart() })
    await waitForSync()
    expect(cartMessages()).toHaveLength(1)
  })
})
