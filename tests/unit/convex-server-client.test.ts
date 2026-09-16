/**
 * @jest-environment node
 *
 * The web server calls a store's Convex deployment with the deploy key and
 * asks for the `*Internal` variants — the ones only admin credentials reach.
 * While deployments are still being upgraded to template v28 those names do
 * not exist everywhere, and Convex reports that with the same message it
 * gives an unauthenticated caller. The client falls back to the public name
 * exactly once, and only for a missing-function error.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const fetchMock = jest.fn<(url: string, init: RequestInit) => Promise<Response>>()
global.fetch = fetchMock as unknown as typeof fetch

function reply(body: unknown): Promise<Response> {
  return Promise.resolve({ json: async () => body } as Response)
}

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)).path)
}

beforeEach(() => { fetchMock.mockReset() })

describe('createConvexServerClient', () => {
  test('falls back to the public name when the internal variant is missing', async () => {
    // Arrange
    const { createConvexServerClient } = await import('@/lib/convex/server')
    fetchMock
      .mockReturnValueOnce(reply({ status: 'error', errorMessage: "Could not find function for 'orders:getOrderByIdInternal'" }))
      .mockReturnValueOnce(reply({ status: 'success', value: { _id: 'o1' } }))
    const client = createConvexServerClient('https://x.convex.cloud', 'dev:key')

    // Act
    const order = await client.query('orders:getOrderByIdInternal', { orderId: 'o1' })

    // Assert
    expect(order).toEqual({ _id: 'o1' })
    expect(calledPaths()).toEqual(['orders:getOrderByIdInternal', 'orders:getOrderById'])
  })

  test('a real error is not retried on the public name', async () => {
    // A refusal or a validation error must surface, not be masked by a
    // second call that might succeed for the wrong reason.
    const { createConvexServerClient } = await import('@/lib/convex/server')
    fetchMock.mockReturnValueOnce(reply({ status: 'error', errorMessage: 'ArgumentValidationError: bad id' }))
    const client = createConvexServerClient('https://x.convex.cloud', 'dev:key')

    await expect(client.query('orders:getOrderByIdInternal', {})).rejects.toThrow('ArgumentValidationError')
    expect(calledPaths()).toEqual(['orders:getOrderByIdInternal'])
  })

  test('a public path is never retried', async () => {
    const { createConvexServerClient } = await import('@/lib/convex/server')
    fetchMock.mockReturnValueOnce(reply({ status: 'error', errorMessage: 'Could not find public function for orders:nope' }))
    const client = createConvexServerClient('https://x.convex.cloud', 'dev:key')

    await expect(client.query('orders:nope', {})).rejects.toThrow('Could not find')
    expect(calledPaths()).toEqual(['orders:nope'])
  })

  test('sends the deploy key on every call', async () => {
    const { createConvexServerClient } = await import('@/lib/convex/server')
    fetchMock.mockReturnValueOnce(reply({ status: 'success', value: 1 }))
    await createConvexServerClient('https://x.convex.cloud', 'dev:key').mutation('orders:updateCustomerContactInternal', {})

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Convex dev:key')
  })
})
