import 'server-only'

/**
 * The database side of "PIN here now" — SERVICE ROLE ONLY, used by
 * `POST /api/cash/remittances/[id]/accept-pin` after the caller is known.
 * PINs never leave the database (`verify_staff_approval_pin`); the receiver
 * lookup and PIN check are the Senior/PWD approval store's, reused as is.
 *
 * `cash_remittances` and `accept_remittance_as` are not in the generated types
 * until their migration is applied live: the client is narrowed ONCE here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createSupabaseApprovalStore } from '@/lib/gov-discount-ledger/supabase-approval-store'
import { checkPinTryLimits } from '@/lib/staff-pin/pin-limits'
import type { RemittancePinStore } from './remittance-pin'
import { REMITTANCE_CONFLICT_CODES, parseRemittance } from './remittances'

function fail(context: string, message: string): never {
  throw new Error(`[cash/accept-pin] ${context}: ${message}`)
}

export function createRemittancePinStore(admin: SupabaseClient<Database>, callerUserId: string): RemittancePinStore {
  const db = admin as unknown as SupabaseClient
  const approvals = createSupabaseApprovalStore(admin)
  return {
    async findRemittance(id) {
      const { data, error } = await db.from('cash_remittances').select('*').eq('id', id).maybeSingle()
      if (error) fail('remittance', error.message)
      return data ? parseRemittance(data) : null
    },

    async findReceiver(tenantId, userId) {
      return approvals.findAccount(tenantId, userId)
    },

    allowPinTry(tenantId, receiverUserId) {
      return checkPinTryLimits(`cash-remit-pin:caller:${tenantId}:${callerUserId}`, tenantId, receiverUserId)
    },

    verifyPin(userId, tenantId, pin) {
      return approvals.verifyPin(userId, tenantId, pin)
    },

    async pinState(userId, tenantId) {
      const { data, error } = await db
        .from('staff_approval_pins')
        .select('failed_attempts, locked_until')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) fail('pin state', error.message)
      if (!data) return null
      const row = data as { failed_attempts: number | null; locked_until: string | null }
      return { failedAttempts: row.failed_attempts ?? 0, lockedUntil: row.locked_until }
    },

    async acceptAs({ id, receiverUserId, receivedCents, note }) {
      const { data, error } = await db.rpc('accept_remittance_as', {
        p_id: id,
        p_receiver: receiverUserId,
        p_received_cents: receivedCents,
        p_note: note,
      })
      if (error) {
        if (error.code && REMITTANCE_CONFLICT_CODES.has(error.code)) return { ok: false, reason: 'not_pending' }
        fail('accept', `${error.code ?? 'no code'}: ${error.message}`)
      }
      if (data === null || data === undefined) return { ok: false, reason: 'not_pending' }
      return { ok: true, remittance: parseRemittance(Array.isArray(data) ? data[0] : data) }
    },
  }
}
