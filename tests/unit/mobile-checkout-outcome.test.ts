/**
 * The white-labeled customer app told every customer "Order Placed!".
 *
 * The Supabase branch bound the insert error and did nothing with it, the
 * order_items insert did not bind its error at all, the Convex branch threw
 * away `errorMessage` and never checked `response.ok`, and the confirmation
 * screen rendered a green checkmark unconditionally before auto-opening
 * Messenger 800ms later. A deactivated merchant's app kept serving checkout,
 * RLS refused every insert with 42501, and the customer was told it worked.
 *
 * `mobile/` is a separate Expo app with no runner of its own (see
 * mobile-checkout-platform-order.test.ts for the precedent), so the outcome
 * model lives in a pure module this suite can execute directly, and the screen
 * wiring is guarded by reading the source.
 */

import fs from 'fs'
import path from 'path'

import {
  classifyConvexOrderResponse,
  classifyOrderLinesWriteError,
  classifyOrderWriteError,
  describeOrderOutcome,
  isOrderRecorded,
  savedOrder,
  untrackedOrder,
  RLS_REFUSAL_CODE,
} from '../../mobile/lib/checkout-outcome'

const MOBILE_ROOT = path.join(process.cwd(), 'mobile')

const readMobile = (relativePath: string) =>
  fs.readFileSync(path.join(MOBILE_ROOT, relativePath), 'utf8')

/** Comments name the bug being prevented, so they quote the very strings under test. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const STORE_NAME = 'Seacook'

describe('classifyOrderWriteError — the platform orders insert', () => {
  it('reads a row-level-security refusal as the store refusing the order', () => {
    // Arrange — what PostgREST returns when orders_insert_customer refuses.
    const error = {
      code: RLS_REFUSAL_CODE,
      message: 'new row violates row-level security policy for table "orders"',
    }

    // Act
    const outcome = classifyOrderWriteError(error)

    // Assert
    expect(outcome.status).toBe('refused')
    expect(outcome.orderId).toBeNull()
    expect(outcome.message).toBeTruthy()
  })

  it('reads any other error as a transient failure, not a refusal', () => {
    const outcome = classifyOrderWriteError({
      code: '08006',
      message: 'connection failure',
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.detail).toContain('connection failure')
  })

  it('fails closed when handed something it cannot read', () => {
    expect(classifyOrderWriteError(null).status).toBe('failed')
    expect(classifyOrderWriteError(undefined).status).toBe('failed')
    expect(classifyOrderWriteError(new Error('boom')).status).toBe('failed')
  })
})

describe('classifyOrderLinesWriteError — the order_items insert', () => {
  it('keeps the order id and never calls a line refusal a store refusal', () => {
    // The parent order row is already committed, so the store DID take the
    // order. Withholding the Messenger message here would leave the merchant
    // holding a live order with a total and no items.
    const outcome = classifyOrderLinesWriteError('order-1', {
      code: RLS_REFUSAL_CODE,
      message: 'new row violates row-level security policy for table "order_items"',
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.orderId).toBe('order-1')
    expect(outcome.message).toBeTruthy()
  })
})

describe('classifyConvexOrderResponse — the Convex mutation', () => {
  it('accepts a success only when an order id came back with it', () => {
    const outcome = classifyConvexOrderResponse(true, 200, {
      status: 'success',
      value: 'k17abc',
    })

    expect(outcome).toEqual(savedOrder('k17abc'))
  })

  it('refuses to call an id-less success a saved order', () => {
    const outcome = classifyConvexOrderResponse(true, 200, {
      status: 'success',
      value: null,
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.orderId).toBeNull()
  })

  it('keeps the deployment’s errorMessage verbatim for the customer', () => {
    const outcome = classifyConvexOrderResponse(true, 200, {
      status: 'error',
      errorMessage: 'Sorry, Adobo Rice is sold out for that date.',
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.message).toBe('Sorry, Adobo Rice is sold out for that date.')
  })

  it('does not read an unparsed non-2xx response as anything but a failure', () => {
    const outcome = classifyConvexOrderResponse(false, 502, null)

    expect(outcome.status).toBe('failed')
    expect(outcome.detail).toContain('502')
  })
})

describe('describeOrderOutcome — what the confirmation screen may claim', () => {
  it('reads as an unqualified success when the row exists', () => {
    const copy = describeOrderOutcome('saved', STORE_NAME)

    expect(copy.tone).toBe('success')
    expect(copy.iconName).toBe('checkmark-circle')
    expect(copy.title).toBe('Order Placed!')
    expect(copy.subtitle).toContain(STORE_NAME)
    expect(copy.canMessengerDeliver).toBe(true)
  })

  it('reads exactly the same for a Messenger-only tenant that stores no row', () => {
    // A tenant with neither convex_deployment_url nor enable_order_management
    // creates no order BY DESIGN. Anything keyed off "did we get an orderId"
    // would show every one of their customers a false error.
    const untracked = describeOrderOutcome('not-tracked', STORE_NAME)
    const saved = describeOrderOutcome('saved', STORE_NAME)

    expect(untracked).toEqual(saved)
    expect(isOrderRecorded('not-tracked')).toBe(true)
    expect(untrackedOrder()).toEqual({
      status: 'not-tracked',
      orderId: null,
      message: null,
      detail: null,
    })
  })

  it('never claims success on a failure, and names Messenger as the way through', () => {
    const copy = describeOrderOutcome('failed', STORE_NAME)

    expect(copy.tone).toBe('warning')
    expect(copy.iconName).not.toBe('checkmark-circle')
    expect(copy.title).not.toBe('Order Placed!')
    expect(copy.subtitle).toMatch(/Messenger/i)
    expect(copy.canMessengerDeliver).toBe(true)
    expect(isOrderRecorded('failed')).toBe(false)
  })

  it('withholds Messenger when the store itself refused the order', () => {
    // Sending the message would hand the merchant an order the platform
    // rejected — a second, quieter version of the same lie.
    const copy = describeOrderOutcome('refused', STORE_NAME)

    expect(copy.tone).toBe('warning')
    expect(copy.title).not.toBe('Order Placed!')
    expect(copy.subtitle).toContain(STORE_NAME)
    expect(copy.canMessengerDeliver).toBe(false)
    expect(isOrderRecorded('refused')).toBe(false)
  })
})

describe('mobile checkout screen — every error is bound and carried', () => {
  const checkoutSource = () => readMobile('app/(main)/checkout.tsx')

  it('binds the order_items insert error instead of dropping it on the floor', () => {
    const source = checkoutSource()

    expect(source).toContain('error: itemsError')
    expect(source).toContain('classifyOrderLinesWriteError')
  })

  it('checks the Convex HTTP response before reading a body out of it', () => {
    expect(checkoutSource()).toContain('convexResponse.ok')
  })

  it('classifies both backends instead of inferring failure from a null orderId', () => {
    const source = checkoutSource()

    expect(source).toContain('classifyConvexOrderResponse')
    expect(source).toContain('classifyOrderWriteError')
    expect(source).toContain('untrackedOrder()')
    expect(source).not.toContain('proceeding to Messenger')
  })

  it('carries the outcome into the confirmation screen', () => {
    expect(checkoutSource()).toContain('saveStatus')
    expect(readMobile('stores/order-store.ts')).toContain('saveStatus')
  })
})

describe('mobile confirmation screen — the header is outcome-driven', () => {
  const confirmationSource = () => readMobile('app/(main)/order-confirmation.tsx')

  it('does not hardcode a success headline', () => {
    const source = confirmationSource()

    expect(withoutComments(source)).not.toContain('Order Placed!')
    expect(source).toContain('describeOrderOutcome')
    expect(source).toContain('outcomeCopy.title')
  })

  it('gates the Messenger hand-off on the outcome rather than on having a URL', () => {
    expect(confirmationSource()).toContain('canMessengerDeliver')
  })
})

describe('mobile tenant query — a deactivated store serves nothing', () => {
  it('filters on is_active the way the web app does', () => {
    // orders_insert_customer requires tenants.is_active = true. Without this
    // filter a deactivated merchant's app kept serving menu and checkout while
    // RLS refused every single order.
    expect(readMobile('lib/queries/use-tenant.ts')).toContain("eq('is_active', true)")
  })
})
