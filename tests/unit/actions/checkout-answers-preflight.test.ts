/**
 * The checkout's look at its required questions before it says "Order placed".
 *
 * The confirmation screen is optimistic, so `createOrderAction` refusing a
 * missing answer would land after the customer was told the order went
 * through. The form already checks its own questions; this preflight asks the
 * SERVER's current list (a tab opened before the owner made a question
 * required still has the old one) with the very rule the action enforces, so
 * the refusal is shown while the form is still on screen. Anything that goes
 * wrong here answers "no opinion": the action keeps the last word.
 */

const checkActionRateLimit = jest.fn()
jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: (...args: unknown[]) => checkActionRateLimit(...args),
}))

const readRequiredQuestions = jest.fn()
jest.mock('@/lib/checkout/required-answers-server', () => {
  const actual = jest.requireActual('@/lib/checkout/required-answers-server') as Record<string, unknown>
  return { ...actual, readRequiredQuestions: (...args: unknown[]) => readRequiredQuestions(...args) }
})

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { preflightCheckoutAnswersAction } from '@/app/actions/checkout-answers'

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const ORDER_TYPE = '66ea076d-2aa1-45d4-b575-743fcdf3d73a'

const NAME = { field_name: 'customer_name', field_label: 'Name', field_type: 'text', is_required: true }
const AGREE = { field_name: 'agree', field_label: 'No refunds', field_type: 'checkbox', is_required: true }

describe('checkout answers preflight', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
    readRequiredQuestions.mockResolvedValue({ ok: true, questions: [NAME, AGREE] })
  })

  it('refuses with every missing answer, field by field, in the sentence the form uses', async () => {
    const verdict = await preflightCheckoutAnswersAction(TENANT, ORDER_TYPE, { customer_name: 'Juan' })

    expect(verdict).toEqual({
      ok: false,
      message: 'Please tick “No refunds”',
      fieldErrors: [{ fieldName: 'agree', message: 'Please tick “No refunds”' }],
    })
    expect(readRequiredQuestions).toHaveBeenCalledWith(expect.anything(), TENANT, ORDER_TYPE)
  })

  it('lets a fully answered form through', async () => {
    const verdict = await preflightCheckoutAnswersAction(TENANT, ORDER_TYPE, { customer_name: 'Juan', agree: 'yes' })
    expect(verdict).toEqual({ ok: true })
  })

  it('has no opinion when the questions cannot be read', async () => {
    readRequiredQuestions.mockResolvedValue({ ok: false })
    expect(await preflightCheckoutAnswersAction(TENANT, ORDER_TYPE, {})).toEqual({ ok: true })
  })

  it('has no opinion when the read throws', async () => {
    readRequiredQuestions.mockRejectedValue(new Error('network'))
    expect(await preflightCheckoutAnswersAction(TENANT, ORDER_TYPE, {})).toEqual({ ok: true })
  })

  it('reads nothing for input the checkout never sends', async () => {
    expect(await preflightCheckoutAnswersAction('not-a-uuid', ORDER_TYPE, {})).toEqual({ ok: true })
    expect(await preflightCheckoutAnswersAction(TENANT, 'not-a-uuid', {})).toEqual({ ok: true })
    expect(await preflightCheckoutAnswersAction(TENANT, ORDER_TYPE, ['not', 'a', 'map'])).toEqual({ ok: true })
    expect(readRequiredQuestions).not.toHaveBeenCalled()
  })

  it('has no opinion once the caller is over its allowance', async () => {
    checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30 })
    expect(await preflightCheckoutAnswersAction(TENANT, ORDER_TYPE, {})).toEqual({ ok: true })
    expect(readRequiredQuestions).not.toHaveBeenCalled()
  })
})
