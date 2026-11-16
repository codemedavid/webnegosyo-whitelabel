/**
 * The server's stock check for one register sale on a 'block' store
 * (plan docs/plans/2026-11-10-pos-block-server.md, trimmed 2026-11-16 by
 * docs/plans/2026-11-16-inventory-trim.md item 2).
 *
 * The register asks at Charge, BEFORE it hands the sale over, with the order
 * id it minted. The shelf is judged by the same engine as the ceilings and
 * the web checkout (`checkout-stock-guard.ts`):
 *
 *   fits          → cleared;
 *   short         → `409 needs_manager` with who may approve, unless the
 *                   cashier may sell past stock themselves (owner / `inventory`,
 *                   reaching the branch), or the request carries a manager's
 *                   PIN, checked by `verify_staff_approval_pin` (bcrypt, five
 *                   tries, 15 min → 1 h → 24 h lock) behind the shared PIN
 *                   limits — then approved, naming that approver.
 *
 * The approval lives on the register only. The database half (a clearance
 * row per sale that triggers on `orders` would demand) was retired before it
 * was ever applied: `20261110120000_pos_stock_block_server.sql` stays unapplied
 * (owner, 2026-11-16). `clearanceId` is still answered because registers up
 * to 1.0.22 refuse a cleared/approved answer without one; it is the order id
 * and names no stored row. 'warn' stores need nothing.
 *
 * Pure apart from the injected store, so every branch is tested.
 */

import { z } from 'zod'
import { hasPermission } from '@/lib/staff-permissions'
import type { ApproverChoice, ApproverRecord, PinVerdict } from '@/lib/gov-discount-ledger/approval-service'
import { PIN_TOO_MANY_TRIES } from '@/lib/staff-pin/pin-limits'

const MAX_LINES = 200
const MAX_LINE_QUANTITY = 9999
const MAX_PICKS = 50
const MAX_ADDON_PORTIONS = 99

const id = z.string().uuid()
const picks = z.array(z.string().min(1).max(100)).max(MAX_PICKS)

const lineSchema = z
  .object({
    menuItemId: id,
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
    optionIds: picks.optional(),
    addonIds: picks.optional(),
    modifierOptionIds: picks.optional(),
    addonQuantities: z.record(z.string().max(100), z.number().int().min(1).max(MAX_ADDON_PORTIONS)).optional(),
  })
  .strict()

const requestSchema = z
  .object({
    tenantId: id,
    orderId: id,
    outletId: id.nullable().optional(),
    // May be empty: a sale of custom lines only still needs a clearance to be written.
    lines: z.array(lineSchema).max(MAX_LINES),
    approval: z
      .object({
        approverUserId: id,
        pin: z.string().regex(/^[0-9]{4,6}$/, 'PIN must be 4 to 6 digits'),
      })
      .strict()
      .optional(),
  })
  .strict()

export type StockClearanceLine = z.infer<typeof lineSchema>
export type StockClearanceRequest = Omit<z.infer<typeof requestSchema>, 'outletId'> & { outletId: string | null }

export function parseStockClearanceRequest(
  body: unknown,
): { ok: true; value: StockClearanceRequest } | { ok: false; error: string } {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }
  return { ok: true, value: { ...parsed.data, outletId: parsed.data.outletId ?? null } }
}

/** One dish the shelf does not cover. */
export interface ClearanceShortfall {
  menuItemId: string
  name: string
  requested: number
  producible: number
}

/**
 * Who may let a sale go past the stock count: the owner, or an account holding
 * `inventory` (the register's `canSellPastStock`) — a branch-locked one only at
 * its own branch.
 */
export function mayApproveOversell(account: ApproverRecord, outletId: string | null): boolean {
  if (account.role !== 'admin') return false
  if (account.isOwner) return true
  if (!hasPermission({ role: account.role, is_owner: account.isOwner, permissions: account.permissions }, 'inventory')) {
    return false
  }
  return account.outletId === null || account.outletId === outletId
}

export interface ClearanceStore {
  readPolicy(tenantId: string): Promise<'warn' | 'block'>
  /** The dishes this sale asks for more of than the shelf holds; [] = fits / no opinion. */
  judge(tenantId: string, outletId: string | null, lines: readonly StockClearanceLine[]): Promise<ClearanceShortfall[]>
  findAccount(tenantId: string, userId: string): Promise<ApproverRecord | null>
  listAccounts(tenantId: string): Promise<ApproverRecord[]>
  usersWithPins(tenantId: string): Promise<Set<string>>
  /** The shared manager-PIN rate limits; false = slow down. */
  allowPinTry(tenantId: string, callerUserId: string, approverUserId: string): Promise<boolean>
  verifyPin(userId: string, tenantId: string, pin: string): Promise<PinVerdict>
}

export interface ClearanceCaller {
  userId: string
  name: string
  account: ApproverRecord
}

export type ClearanceOutcome =
  | { ok: true; status: 'not_required' }
  /** `clearanceId` = the order id: only for registers up to 1.0.22, which require the field. */
  | { ok: true; status: 'cleared'; clearanceId: string }
  | { ok: true; status: 'approved'; clearanceId: string; approverName: string }
  | {
      ok: false
      status: 409
      code: 'needs_manager'
      error: string
      shortfalls: ClearanceShortfall[]
      approvers: ApproverChoice[]
    }
  | { ok: false; status: 400 | 403 | 423 | 429; error: string }

export const CLEARANCE_COPY = {
  needsManager: 'Stock does not cover this sale. A manager has to approve it.',
  approverRefused: 'That person cannot approve selling past stock here.',
  wrongPin: 'That PIN is not right. Try again.',
  locked: 'Too many wrong tries — this PIN is locked for now. Try again later or ask the owner.',
  noPin: 'This manager has not set an approval PIN yet.',
} as const

const PIN_REFUSALS: Record<Exclude<PinVerdict, 'ok'>, { status: 400 | 423; error: string }> = {
  wrong: { status: 400, error: CLEARANCE_COPY.wrongPin },
  locked: { status: 423, error: CLEARANCE_COPY.locked },
  no_pin: { status: 400, error: CLEARANCE_COPY.noPin },
}

async function approverChoices(store: ClearanceStore, tenantId: string, outletId: string | null): Promise<ApproverChoice[]> {
  const [accounts, withPins] = await Promise.all([store.listAccounts(tenantId), store.usersWithPins(tenantId)])
  return accounts
    .filter((account) => mayApproveOversell(account, outletId))
    .map((account) => ({ userId: account.userId, name: account.name, hasPin: withPins.has(account.userId) }))
    .sort((a, b) => Number(b.hasPin) - Number(a.hasPin) || a.name.localeCompare(b.name))
}

export async function decideStockClearance(
  store: ClearanceStore,
  request: StockClearanceRequest,
  caller: ClearanceCaller,
): Promise<ClearanceOutcome> {
  const { tenantId, outletId, orderId, lines } = request
  if ((await store.readPolicy(tenantId)) !== 'block') return { ok: true, status: 'not_required' }

  const shortfalls = await store.judge(tenantId, outletId, lines)
  if (shortfalls.length === 0) return { ok: true, status: 'cleared', clearanceId: orderId }

  if (mayApproveOversell(caller.account, outletId)) {
    return { ok: true, status: 'approved', clearanceId: orderId, approverName: caller.name }
  }

  if (!request.approval) {
    return {
      ok: false,
      status: 409,
      code: 'needs_manager',
      error: CLEARANCE_COPY.needsManager,
      shortfalls,
      approvers: await approverChoices(store, tenantId, outletId),
    }
  }

  const { approverUserId, pin } = request.approval
  const approver = await store.findAccount(tenantId, approverUserId)
  if (!approver || !mayApproveOversell(approver, outletId)) {
    return { ok: false, status: 403, error: CLEARANCE_COPY.approverRefused }
  }
  if (!(await store.allowPinTry(tenantId, caller.userId, approver.userId))) {
    return { ok: false, status: 429, error: PIN_TOO_MANY_TRIES }
  }
  const verdict = await store.verifyPin(approver.userId, tenantId, pin)
  if (verdict !== 'ok') return { ok: false, ...PIN_REFUSALS[verdict] }

  return { ok: true, status: 'approved', clearanceId: orderId, approverName: approver.name }
}
