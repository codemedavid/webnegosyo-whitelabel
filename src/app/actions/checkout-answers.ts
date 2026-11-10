'use server'

import { z } from 'zod'
import { checkActionRateLimit } from '@/lib/action-rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeCustomerData } from '@/lib/checkout/customer-data-guard'
import {
  REQUIRED_QUESTIONS_TIMEOUT_MS,
  judgeRequiredAnswers,
  readRequiredQuestions,
  type RequiredAnswersVerdict,
} from '@/lib/checkout/required-answers-server'

const NO_OPINION: RequiredAnswersVerdict = { ok: true }
const uuid = z.string().uuid()

/**
 * The checkout's look at its required questions before it says "Order placed".
 *
 * `createOrderAction` refuses an order with a required answer missing, but the
 * web checkout is optimistic: that refusal would land after the customer was
 * told the order went through. The form already checks the questions it
 * shows; this asks the server's CURRENT list (a tab opened before the owner
 * made a question required still holds the old one) with the very verdict the
 * action enforces, so the checkout can stay on the form and say what's missing.
 *
 * It decides nothing new: the action keeps the last word, so every failure
 * here — bad input, over the allowance, an unreadable list — is "no opinion".
 * Unauthenticated like the stock and presell preflights (a diner has no
 * session); what comes back is the store's own question labels, which the
 * checkout page already shows.
 */
export async function preflightCheckoutAnswersAction(
  tenantId: unknown,
  orderTypeId: unknown,
  answers: unknown,
): Promise<RequiredAnswersVerdict> {
  try {
    const tenant = uuid.safeParse(tenantId)
    const orderType = uuid.safeParse(orderTypeId)
    if (!tenant.success || !orderType.success) return NO_OPINION
    // The same bounds the order itself gets; anything else is the action's to refuse.
    const sanitized = sanitizeCustomerData(answers)
    if (!sanitized.ok) return NO_OPINION

    const rate = await checkActionRateLimit(`answers-preflight:${tenant.data}`, {
      limit: 120,
      windowSec: 60,
      onRedisFailure: 'instance',
    })
    if (!rate.allowed) return NO_OPINION

    const read = await readRequiredQuestions(
      createAdminClient({ timeoutMs: REQUIRED_QUESTIONS_TIMEOUT_MS }),
      tenant.data,
      orderType.data,
    )
    return judgeRequiredAnswers(read, sanitized.data)
  } catch (error) {
    console.error('[checkout] Required answers preflight failed', tenantId, error)
    return NO_OPINION
  }
}
