import { parseOrderActivityRequest } from '@/lib/staff-activity/order-activity-request'

const TENANT = '11111111-1111-4111-8111-111111111111'

describe('parseOrderActivityRequest', () => {
  test('accepts a register sale and defaults its status to pending', () => {
    const parsed = parseOrderActivityRequest({
      tenantId: TENANT,
      backend: 'convex',
      externalOrderId: 'abc',
      source: 'pos',
      orderTotal: '120.50',
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        tenantId: TENANT,
        backend: 'convex',
        externalOrderId: 'abc',
        status: 'pending',
        source: 'pos',
        orderTotal: 120.5,
        outletId: null,
      },
    })
  })

  test('refuses a body that tries to name the actor', () => {
    const parsed = parseOrderActivityRequest({
      tenantId: TENANT,
      backend: 'convex',
      externalOrderId: 'abc',
      source: 'pos',
      actorUserId: 'someone-else',
    })
    expect(parsed.ok).toBe(false)
  })

  test.each([
    ['tenant', { backend: 'convex', externalOrderId: 'a', source: 'pos' }],
    ['backend', { tenantId: TENANT, backend: 'firebase', externalOrderId: 'a', source: 'pos' }],
    ['order id', { tenantId: TENANT, backend: 'convex', source: 'pos' }],
    ['source', { tenantId: TENANT, backend: 'convex', externalOrderId: 'a', source: 'kiosk' }],
    ['outlet', { tenantId: TENANT, backend: 'convex', externalOrderId: 'a', source: 'pos', outletId: 'nope' }],
  ])('rejects a body with a bad %s', (_label, body) => {
    expect(parseOrderActivityRequest(body).ok).toBe(false)
  })

  test('an unreadable total becomes null rather than a refusal', () => {
    const parsed = parseOrderActivityRequest({
      tenantId: TENANT,
      backend: 'platform_supabase',
      externalOrderId: 'a',
      source: 'pos',
      orderTotal: 'abc',
    })
    expect(parsed.ok && parsed.value.orderTotal).toBeNull()
  })
})
