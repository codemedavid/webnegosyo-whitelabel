/**
 * Manager approvals' database side — service role only. PINs never leave the
 * database: they are hashed and checked by `set_/verify_staff_approval_pin`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ApprovalStore, ApproverRecord, PinVerdict } from './approval-service'

type Db = SupabaseClient<Database>

interface AppUserRow {
  user_id: string
  role: string
  is_owner: boolean | null
  permissions: string[] | null
  outlet_id: string | null
  display_name: string | null
  email: string | null
}

const APP_USER_COLUMNS = 'user_id, role, is_owner, permissions, outlet_id, display_name, email'
const MAX_ACCOUNTS = 100

function fail(context: string, message: string): never {
  throw new Error(`[gov-discount-approvals] ${context}: ${message}`)
}

function toApprover(row: AppUserRow): ApproverRecord {
  return {
    userId: row.user_id,
    name: row.display_name?.trim() || row.email || 'Manager',
    role: row.role,
    isOwner: row.is_owner === true,
    permissions: row.permissions,
    outletId: row.outlet_id,
  }
}

function toPinVerdict(value: unknown): PinVerdict {
  return value === 'ok' || value === 'wrong' || value === 'locked' ? value : 'no_pin'
}

export function createSupabaseApprovalStore(db: Db): ApprovalStore {
  return {
    async findAccount(tenantId, userId) {
      const { data, error } = await db
        .from('app_users')
        .select(APP_USER_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
      if (error) fail('approver', error.message)
      return data ? toApprover(data as AppUserRow) : null
    },

    async listAccounts(tenantId) {
      const { data, error } = await db
        .from('app_users')
        .select(APP_USER_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .limit(MAX_ACCOUNTS)
      if (error) fail('approvers', error.message)
      return ((data ?? []) as AppUserRow[]).map(toApprover)
    },

    async usersWithPins(tenantId) {
      const { data, error } = await db
        .from('staff_approval_pins')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .limit(MAX_ACCOUNTS)
      if (error) fail('pins', error.message)
      return new Set((data ?? []).map((row) => row.user_id))
    },

    async verifyPin(userId, tenantId, pin) {
      const { data, error } = await db.rpc('verify_staff_approval_pin', {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_pin: pin,
      })
      if (error) fail('verify pin', error.message)
      return toPinVerdict(data)
    },

    async setPin(userId, tenantId, pin) {
      const { error } = await db.rpc('set_staff_approval_pin', {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_pin: pin,
      })
      if (error) fail('set pin', error.message)
    },

    async createApproval(row) {
      const { data, error } = await db
        .from('gov_discount_approvals')
        .insert({
          tenant_id: row.tenantId,
          outlet_id: row.outletId,
          approver_user_id: row.approverUserId,
          approver_name: row.approverName,
          cashier_user_id: row.cashierUserId,
          cashier_name: row.cashierName,
          approved_reduction: row.approvedReduction,
          summary: JSON.parse(JSON.stringify(row.summary)),
          sale_fingerprint: row.saleFingerprint,
        })
        .select('id, expires_at')
        .single()
      if (error) fail('create approval', error.message)
      return { id: data.id, expiresAt: data.expires_at }
    },
  }
}
