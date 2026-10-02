/**
 * What the merchant app may ask `/api/boost/ai`, and who may ask it.
 *
 * Pure: the route resolves the caller's `app_users` row and hands it here, so
 * the whole gate is unit-tested without a session.
 */

import { z } from 'zod'
import { canAccessStoreAdmin, type PlatformAction } from '@/lib/platform-staff/permissions'
import { hasPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import type { BoostIdeaKind } from '../ideas'

const tenantId = z.string().uuid()
const proposalId = z.string().uuid()

const boostAiRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('state'), tenantId }),
  z.object({ op: z.literal('generate'), tenantId }),
  z.object({ op: z.literal('enable'), tenantId }),
  z.object({ op: z.literal('create'), tenantId, proposalId }),
  z.object({ op: z.literal('dismiss'), tenantId, proposalId }),
])

export type BoostAiRequest = z.infer<typeof boostAiRequestSchema>
export type BoostAiOp = BoostAiRequest['op']

export function parseBoostAiRequest(body: unknown): { ok: true; value: BoostAiRequest } | { ok: false; error: string } {
  const parsed = boostAiRequestSchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: 'Invalid request' }
  return { ok: true, value: parsed.data }
}

export interface BoostAiCaller {
  role: string
  tenant_id: string | null
  is_owner?: boolean | null
  permissions?: string[] | null
  platform_permissions?: string[] | null
}

/** The platform verb each operation is — narrows platform staff only. */
export const BOOST_AI_OP_ACTION: Record<BoostAiOp, PlatformAction> = {
  state: 'view',
  generate: 'create',
  enable: 'edit',
  create: 'create',
  dismiss: 'edit',
}

/**
 * What creating each offer really does, as the web's writes check it: a
 * pairing replaces the rows it supersedes (`saveBoostPairing` asks `delete`),
 * a cart last call edits the store's settings, the rest add rows.
 */
export const BOOST_AI_CREATE_ACTION: Record<BoostIdeaKind, PlatformAction> = {
  combo: 'create',
  upgrade: 'create',
  pairing: 'delete',
  last_call: 'edit',
}

/** Feature permissions per offer: a combo is a menu entry, so `createBundle` asks `menu` too. */
export function boostAiCreatePermissions(kind: BoostIdeaKind): StaffPermissionKey[] {
  return kind === 'combo' ? ['analytics', 'menu'] : ['analytics']
}

/**
 * Same gate as the web's Boost Sales actions: an admin of THIS store (or a
 * superadmin, or platform staff with the verb) holding every listed feature
 * permission. A combo also needs `menu`, exactly as `createBundle` demands.
 */
export function decideBoostAiAccess(
  caller: BoostAiCaller | null,
  tenant: string,
  action: PlatformAction,
  permissions: readonly StaffPermissionKey[]
): boolean {
  if (!caller || !canAccessStoreAdmin(caller, tenant, action)) return false
  const holder = { role: caller.role, is_owner: caller.is_owner ?? false, permissions: caller.permissions ?? null }
  return permissions.every((key) => hasPermission(holder, key))
}
