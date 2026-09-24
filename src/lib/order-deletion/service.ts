/**
 * Owner-initiated order deletion, in three steps the owner cannot reorder:
 *
 *   1. export  — the matching orders are written to a file the owner downloads,
 *                and their ids are recorded as a short-lived deletion ticket;
 *   2. confirm — the owner types the store name and re-enters their password;
 *                only the orders in that ticket are deleted, and only if they
 *                have not changed since the file was made;
 *   3. restore — for RECOVERY_DAYS the orders can be put back; after that the
 *                archive is purged.
 *
 * The caller passed in is already a verified owner (request-caller.ts). The
 * database functions check ownership again and scope every row to the
 * ticket's own store, so nothing here can reach another store's orders.
 */
import { createHash } from 'node:crypto'
import {
  EXPORT_TTL_MINUTES,
  MAX_ORDERS_PER_DELETION,
  PASSWORD_FAILURE_WINDOW_MINUTES,
  ACTIVE_ORDER_STATUSES,
} from './constants'
import { isPasswordAttemptAllowed, matchesConfirmationPhrase } from './access'
import { buildOrderExportCsv, exportFileName } from './export-csv'
import type {
  DeletionCaller,
  DeletionRecord,
  DeletionRequest,
  DeletionStore,
  ExecuteResult,
  OrderDeletionRepo,
  PasswordVerifier,
  RestoreResult,
} from './types'

export type OrderDeletionErrorCode =
  | 'nothing_to_delete'
  | 'too_many_orders'
  | 'not_found'
  | 'export_used'
  | 'export_expired'
  | 'confirmation_mismatch'
  | 'wrong_password'
  | 'too_many_attempts'
  | 'recovery_closed'
  | 'not_restorable'

/** A refusal the owner can act on. Anything else is an unexpected failure. */
export class OrderDeletionError extends Error {
  constructor(
    readonly code: OrderDeletionErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OrderDeletionError'
  }
}

const ACTIVE = new Set<string>(ACTIVE_ORDER_STATUSES)

function sumTotals(orders: readonly { total: number }[]): number {
  const centavos = orders.reduce((sum, order) => sum + Math.round(Number(order.total) * 100), 0)
  return centavos / 100
}

export interface DeletionPreview {
  orderCount: number
  orderTotal: number
  activeCount: number
  earliest: string | null
  latest: string | null
}

export async function previewDeletion(
  repo: OrderDeletionRepo,
  caller: DeletionCaller,
  request: DeletionRequest
): Promise<DeletionPreview> {
  const orders = await repo.findOrdersForScope(caller.tenantId, request.scope, request.includeActive)
  const dates = orders.map((order) => order.created_at).sort()
  return {
    orderCount: orders.length,
    orderTotal: sumTotals(orders),
    activeCount: orders.filter((order) => ACTIVE.has(order.status)).length,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  }
}

export interface PreparedExport {
  deletionId: string
  csv: string
  fileName: string
  orderCount: number
  orderTotal: number
  expiresAt: string
}

export async function prepareExport(
  repo: OrderDeletionRepo,
  caller: DeletionCaller,
  store: DeletionStore,
  request: DeletionRequest,
  now: Date
): Promise<PreparedExport> {
  const orders = await repo.findOrdersForScope(caller.tenantId, request.scope, request.includeActive)
  if (orders.length === 0) {
    throw new OrderDeletionError('nothing_to_delete', 'No orders match. Nothing would be deleted.')
  }
  if (orders.length > MAX_ORDERS_PER_DELETION) {
    throw new OrderDeletionError(
      'too_many_orders',
      `That is ${orders.length} orders. Delete at most ${MAX_ORDERS_PER_DELETION} at a time — pick a shorter date range.`
    )
  }

  const orderIds = orders.map((order) => order.id)
  const [items, outletNames] = await Promise.all([
    repo.findItems(orderIds),
    repo.findOutletNames(caller.tenantId),
  ])
  const csv = buildOrderExportCsv(orders, items, outletNames)
  const orderTotal = sumTotals(orders)
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_MINUTES * 60_000).toISOString()

  const { id: deletionId } = await repo.insertDeletion({
    tenant_id: caller.tenantId,
    requested_by: caller.userId,
    scope: request.scope,
    include_active: request.includeActive,
    order_ids: orderIds,
    order_count: orders.length,
    order_total: orderTotal,
    export_sha256: createHash('sha256').update(csv).digest('hex'),
    exported_at: now.toISOString(),
    export_expires_at: expiresAt,
  })

  await repo.recordAudit({
    tenant_id: caller.tenantId,
    actor_id: caller.userId,
    action: 'exported',
    deletion_id: deletionId,
    detail: { scope: request.scope, orderCount: orders.length, includeActive: request.includeActive },
  })

  return {
    deletionId,
    csv,
    fileName: exportFileName(store.slug, now),
    orderCount: orders.length,
    orderTotal,
    expiresAt,
  }
}

/** The caller's own ticket in the caller's own store; anything else reads as absent. */
async function findOwnDeletion(
  repo: OrderDeletionRepo,
  caller: DeletionCaller,
  deletionId: string
): Promise<DeletionRecord> {
  const deletion = await repo.findDeletion(deletionId, caller.tenantId)
  if (!deletion || deletion.requested_by !== caller.userId) {
    throw new OrderDeletionError('not_found', 'That export was not found. Start again from the export step.')
  }
  return deletion
}

function assertExportUsable(deletion: DeletionRecord, now: Date): void {
  if (deletion.status !== 'exported') {
    throw new OrderDeletionError('export_used', 'That export has already been used. Make a new export to continue.')
  }
  if (new Date(deletion.export_expires_at).getTime() <= now.getTime()) {
    throw new OrderDeletionError(
      'export_expired',
      `Exports are valid for ${EXPORT_TTL_MINUTES} minutes. Download a fresh export to continue.`
    )
  }
}

export interface ConfirmInput {
  deletionId: string
  password: string
  confirmation: string
}

export async function confirmDeletion(
  repo: OrderDeletionRepo,
  verifyPassword: PasswordVerifier,
  caller: DeletionCaller,
  store: DeletionStore,
  input: ConfirmInput,
  now: Date
): Promise<ExecuteResult> {
  const deletion = await findOwnDeletion(repo, caller, input.deletionId)
  assertExportUsable(deletion, now)

  const since = new Date(now.getTime() - PASSWORD_FAILURE_WINDOW_MINUTES * 60_000).toISOString()
  if (!isPasswordAttemptAllowed(await repo.countRecentPasswordFailures(caller.userId, since))) {
    throw new OrderDeletionError(
      'too_many_attempts',
      `Too many wrong passwords. Try again in ${PASSWORD_FAILURE_WINDOW_MINUTES} minutes.`
    )
  }

  // Checked before the password so a typo in the name never spends an attempt.
  if (!matchesConfirmationPhrase(input.confirmation, store.name)) {
    await repo.recordAudit({
      tenant_id: caller.tenantId,
      actor_id: caller.userId,
      action: 'confirmation_failed',
      deletion_id: deletion.id,
    })
    throw new OrderDeletionError('confirmation_mismatch', `Type the store name exactly: ${store.name}`)
  }

  if ((await verifyPassword(caller.email, input.password, caller.userId)) !== 'ok') {
    await repo.recordAudit({
      tenant_id: caller.tenantId,
      actor_id: caller.userId,
      action: 'password_failed',
      deletion_id: deletion.id,
    })
    throw new OrderDeletionError('wrong_password', 'That password is not correct.')
  }

  return repo.executeDeletion(deletion.id, caller.userId)
}

export async function restoreDeletion(
  repo: OrderDeletionRepo,
  caller: DeletionCaller,
  deletionId: string,
  now: Date
): Promise<RestoreResult> {
  const deletion = await repo.findDeletion(deletionId, caller.tenantId)
  if (!deletion) {
    throw new OrderDeletionError('not_found', 'That deletion was not found.')
  }
  if (deletion.status !== 'deleted' || !deletion.purge_after) {
    throw new OrderDeletionError('not_restorable', 'Those orders are not waiting in the recovery window.')
  }
  if (new Date(deletion.purge_after).getTime() <= now.getTime()) {
    throw new OrderDeletionError('recovery_closed', 'The recovery window has closed; these orders are gone.')
  }
  return repo.restoreDeletion(deletion.id, caller.userId)
}
