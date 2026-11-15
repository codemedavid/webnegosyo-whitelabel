/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'

jest.mock('server-only', () => ({}))
const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

import { appRoute } from '@/lib/app-api/app-route'

const request = () => new NextRequest('http://localhost/api/app/v1/me', { method: 'DELETE', headers: { 'x-app-id': 'com.webnegosyo.kapedemo' } })
const handler = jest.fn(async () => NextResponse.json({ ok: true }))

beforeEach(() => {
  handler.mockClear()
  getTenantApp.mockResolvedValue({ app: { tenantId: 't1', slug: 'kape', status: 'paused' }, error: null })
})

describe('appRoute on a paused store', () => {
  it('refuses store data routes', async () => {
    const response = await appRoute({ scope: 'catalog' }, handler)({ request: request() })
    expect(response.status).toBe(503)
    expect(handler).not.toHaveBeenCalled()
  })

  it("still serves the customer's own account routes (delete account, sign out)", async () => {
    const response = await appRoute({ scope: 'me', allowPaused: true }, handler)({ request: request() })
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('account routes are allowed while paused', () => {
  it.each([
    ['src/app/api/app/v1/me/route.ts'],
    ['src/app/api/app/v1/auth/session/route.ts'],
    ['src/app/api/app/v1/me/orders/route.ts'],
    ['src/app/api/app/v1/me/push-token/route.ts'],
  ])('%s', (file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const source = require('fs').readFileSync(require('path').join(process.cwd(), file), 'utf8') as string
    expect(source).toMatch(/allowPaused: true/)
  })
})
