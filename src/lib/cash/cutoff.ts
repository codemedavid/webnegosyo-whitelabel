/**
 * Changing when the business day ends (`set_business_day_cutoff`, migration
 * 20261027120000). The database decides the first day the new cutoff applies
 * (tomorrow's business day, later if today is closed or the new start would
 * already be past) and returns it; the screen then says "Starts from …".
 *
 * Who: the owner or a store-wide `settings` holder (it moves every report),
 * not `cash_manage`.
 */

import { z } from 'zod'
import { CUTOFF_STEP_MINUTES, MAX_CUTOFF_MINUTES, isValidCutoffMinutes } from '@/lib/business-day/trading-day'
import { callCashRpc, cashFailure, type CashResult, type CashRpcClient } from './cash-rpc'

export const CUTOFF_FORBIDDEN_MESSAGE = 'Only the owner or someone with Settings can change when the business day ends.'
export const CUTOFF_RANGE_MESSAGE = 'The business day can end between midnight and 11:45 AM, in 15-minute steps.'

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Every time the setting offers: midnight to 11:45 AM in 15-minute steps. */
export const CUTOFF_CHOICES: readonly number[] = Array.from(
  { length: MAX_CUTOFF_MINUTES / CUTOFF_STEP_MINUTES + 1 },
  (_, index) => index * CUTOFF_STEP_MINUTES,
)

/** The quick chips (UX §2): midnight and 1–6 AM. */
export const CUTOFF_QUICK_CHOICES: readonly number[] = [0, 60, 120, 180, 240, 300, 360]

/** Returns the first business day (YYYY-MM-DD) that ends at the new time. */
export function setBusinessDayCutoff(client: CashRpcClient, tenantId: string, cutoffMinutes: number): Promise<CashResult<string>> {
  if (!isValidCutoffMinutes(cutoffMinutes)) return Promise.resolve(cashFailure('invalid', CUTOFF_RANGE_MESSAGE))
  return callCashRpc(client, 'set_business_day_cutoff', { p_tenant: tenantId, p_cutoff_minutes: cutoffMinutes }, (data) => dayKey.parse(data), {
    forbiddenMessage: CUTOFF_FORBIDDEN_MESSAGE,
    invalidMessage: CUTOFF_RANGE_MESSAGE,
  })
}
