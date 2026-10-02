/**
 * @jest-environment node
 *
 * The tracking page's alert service worker. Android Chrome refuses
 * `new Notification()`, so the "your order is ready" notification needs a
 * worker registration. It lives under `/api/` because tenant hosts rewrite
 * every other path into the storefront.
 */

type Listener = (event: unknown) => void

async function loadWorker() {
  const { GET } = await import('@/app/api/orders/ready-alert-sw/route')
  const response = GET()
  const source = await response.text()

  const listeners: Record<string, Listener> = {}
  const focus = jest.fn(async () => undefined)
  const windows = [{ url: 'https://kape.example.com/order/abc', focus }]
  const self = {
    location: { origin: 'https://kape.example.com' },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
    skipWaiting: jest.fn(),
    clients: {
      claim: jest.fn(async () => undefined),
      matchAll: jest.fn(async () => windows),
      openWindow: jest.fn(async () => undefined),
    },
  }
  new Function('self', source)(self)

  async function click(url: unknown) {
    let pending: Promise<unknown> = Promise.resolve()
    const close = jest.fn()
    listeners.notificationclick({
      notification: { close, data: { url } },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise
      },
    })
    await pending
    return { close }
  }

  return { response, self, focus, click }
}

describe('GET /api/orders/ready-alert-sw', () => {
  test('serves an uncached JavaScript worker', async () => {
    const { response } = await loadWorker()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/javascript/)
    expect(response.headers.get('cache-control')).toMatch(/no-cache/)
  })

  test('tapping the notification focuses the open tracking page', async () => {
    const { self, focus, click } = await loadWorker()

    const { close } = await click('https://kape.example.com/order/abc')

    expect(close).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  test('reopens the tracking page when its tab is gone', async () => {
    const { self, click } = await loadWorker()

    await click('https://kape.example.com/order/other')

    expect(self.clients.openWindow).toHaveBeenCalledWith('https://kape.example.com/order/other')
  })

  test('never opens another origin', async () => {
    const { self, focus, click } = await loadWorker()

    await click('https://evil.example.net/phish')
    await click(42)

    expect(self.clients.openWindow).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })
})
