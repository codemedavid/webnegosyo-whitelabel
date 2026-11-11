/**
 * Runs under the default jsdom environment on purpose.
 *
 * A server action file is imported by client components (as a reference), and
 * their tests load the real module under jsdom, where the web `Request` that
 * `next/server` needs does not exist. So nothing `defineAction` loads up front
 * may import `next/server` or anything else that only exists on the server.
 */
import { z } from 'zod'
import { defineAction } from '@/platform/http/define-action'

describe('defineAction in a browser-like test environment', () => {
  it('is jsdom here (guards the premise)', () => {
    expect(typeof window).toBe('object')
    expect(typeof Request).toBe('undefined')
  })

  it('loads, and a declared action can be defined', () => {
    const action = defineAction({
      auth: { kind: 'staff', permission: 'menu', branch: 'any', storeClaim: ([tenantId]) => tenantId },
      args: [z.string()],
      handler: async () => ({ success: true as const }),
    })

    expect(typeof action).toBe('function')
  })
})
