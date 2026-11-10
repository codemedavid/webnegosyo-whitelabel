/**
 * Performing a branch transfer.
 *
 * `stock-transfer.ts` decides what should happen; this writes it. The division
 * matters: every rule about what a transfer may do is testable without a
 * database, and this file is only plumbing — reads, three inserts, and the
 * status change.
 *
 * **The legs go through `stock_movements`, never `inventory_stock`.**
 * `apply_stock_movement()` stays the single writer of every on-hand figure, so
 * two concurrent movements serialize on the row rather than racing through a
 * read-modify-write here, and the ledger can always explain the number it
 * produced. A transfer that adjusted the stock table directly would move a
 * quantity with nothing recording who moved it.
 *
 * Deliberately NOT routed through `recordStockMovementWith`. That function pins
 * every movement to the acting account's own branch, which is right for a
 * delivery or a stocktake and impossible here: a transfer's whole purpose is to
 * write one leg at a branch the actor is not standing in. Authority is checked
 * per operation instead — the sender against the source, the receiver against
 * the destination.
 */

import { createClient } from '@/lib/supabase/server'
import { INVENTORY_ITEM_COLUMNS } from '@/lib/inventory/cost-columns'
import { reportStockFailure } from '@/lib/inventory/stock-failure-report'
import type { InventoryItem } from '@/types/database'
import {
  resolveActingBranchScope,
  type StockActorClient,
} from '@/lib/inventory/acting-branch-scope'
import {
  validateTransferDraft,
  assertTransferTransition,
  canSendTransfer,
  canReceiveTransfer,
  resolveReceiptLines,
  buildSendMovements,
  buildReceiveMovements,
  type StockTransferStatus,
  type TransferLineDraft,
  type TransferLineReceipt,
  type TransferMovement,
} from '@/lib/inventory/stock-transfer'

/** The document as this service reads it back. */
interface TransferRow {
  id: string
  tenant_id: string
  from_outlet_id: string | null
  to_outlet_id: string | null
  status: StockTransferStatus
}

interface TransferLineRow {
  inventory_item_id: string
  sent_quantity: number
  received_quantity: number | null
}

export interface CreateTransferInput {
  fromOutletId: string | null
  toOutletId: string | null
  lines: readonly TransferLineDraft[]
  note?: string
}

/** Permission, lifecycle and not-found refusals from the transfer functions. */
const EXPECTED_REFUSAL_CODES = new Set(['42501', '23514', 'P0002', '40001'])

/** The message both refusals share, because from the merchant's side it is one rule. */
const NOT_YOUR_BRANCH = 'You can only move stock in and out of your own branch'

async function loadTransfer(
  supabase: StockActorClient,
  tenantId: string,
  transferId: string,
): Promise<TransferRow> {
  const { data, error } = await supabase
    .from('stock_transfers')
    .select('id, tenant_id, from_outlet_id, to_outlet_id, status')
    .eq('tenant_id', tenantId)
    .eq('id', transferId)
    .single()
  if (error) throw error
  if (!data) throw new Error('Transfer not found')
  return data as unknown as TransferRow
}

async function loadLines(
  supabase: StockActorClient,
  tenantId: string,
  transferId: string,
): Promise<TransferLineRow[]> {
  const { data, error } = await supabase
    .from('stock_transfer_lines')
    .select('inventory_item_id, sent_quantity, received_quantity')
    .eq('tenant_id', tenantId)
    .eq('transfer_id', transferId)
  if (error) throw error
  return (data ?? []) as unknown as TransferLineRow[]
}

/** The stored lines in the shape the pure module works in. */
function toReceipts(lines: readonly TransferLineRow[]): TransferLineReceipt[] {
  return lines.map((line) => ({
    inventoryItemId: line.inventory_item_id,
    sentQuantity: Number(line.sent_quantity),
    receivedQuantity: 0,
  }))
}

/**
 * The legs in the shape the transfer functions take. `entered_quantity`,
 * the transfer id and (on a send) the reason are set by the function itself;
 * `unit_cost` is advisory only: the ledger trigger sets every transfer leg's
 * cost whatever is sent here.
 */
function toLegPayload(movements: readonly TransferMovement[]) {
  return movements.map((movement) => ({
    inventory_item_id: movement.inventoryItemId,
    outlet_id: movement.outletId,
    reason: movement.reason,
    quantity_delta: movement.quantityDelta,
    unit_cost: movement.unitCost ?? null,
    note: movement.note ?? null,
  }))
}

/**
 * Run a transfer step (legs + document) as one database transaction.
 *
 * The ledger only accepts a send's legs while the transfer is a draft and a
 * receipt's while it is sent, so the status cannot be claimed first; the
 * functions (20261107130200) lock the transfer row, write the legs through the
 * normal guards and flip the status together. A refusal anywhere leaves the
 * stock and the document exactly as they were, so a retry works, and a second
 * tab waits on the lock and then finds the transfer already moved on.
 */
async function applyTransferStep(
  supabase: StockActorClient,
  tenantId: string,
  movements: readonly TransferMovement[],
  call: () => PromiseLike<{ error: { message: string; code?: string } | null }>,
): Promise<void> {
  const before = await readItemsBeforeLegs(supabase, tenantId, movements)
  const { error } = await call()
  if (error) {
    // A refusal the merchant can act on (not your branch, already sent) is
    // not an incident; anything else is.
    const code = (error as { code?: string }).code
    if (!code || !EXPECTED_REFUSAL_CODES.has(code)) {
      reportStockFailure({ tenantId, operation: 'stock_transfer_step' }, error)
    }
    throw error
  }
  await notifyLegs(tenantId, before, movements)
}

/**
 * The ingredient rows as they stood before the legs, for the alert path's
 * crossings. A failed read only costs the alerts, never the transfer.
 */
async function readItemsBeforeLegs(
  supabase: StockActorClient,
  tenantId: string,
  movements: readonly TransferMovement[],
): Promise<InventoryItem[] | null> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(INVENTORY_ITEM_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('id', [...new Set(movements.map((movement) => movement.inventoryItemId))])
  if (error) {
    console.error('[inventory] Transfer legs: ingredient read failed; skipping alerts', tenantId, error.message)
    return null
  }
  return ((data ?? []) as unknown as Array<Omit<InventoryItem, 'unit_cost'>>).map((item) => ({ ...item, unit_cost: 0 }))
}

/**
 * A transfer moves stock like any other movement, so it alerts, 86es and
 * restores like one: the van that empties North alerts North, and the
 * delivery that lands at South puts its hidden dishes back. Until 2026-11-03
 * the legs bypassed this entirely, leaving stale "out" alerts at the branch
 * that had just received stock. One call per branch the legs touched.
 */
async function notifyLegs(
  tenantId: string,
  items: readonly InventoryItem[] | null,
  movements: readonly TransferMovement[],
): Promise<void> {
  if (!items) return
  const byOutlet = new Map<string | null, Map<string, number>>()
  for (const movement of movements) {
    const deltas = byOutlet.get(movement.outletId) ?? new Map<string, number>()
    deltas.set(movement.inventoryItemId, (deltas.get(movement.inventoryItemId) ?? 0) + movement.quantityDelta)
    byOutlet.set(movement.outletId, deltas)
  }
  try {
    const { processStockLevelChanges } = await import('@/lib/inventory/stock-alerts-service')
    for (const [outletId, deltas] of byOutlet) {
      await processStockLevelChanges(tenantId, items, deltas, outletId)
    }
  } catch (error) {
    console.error('[inventory] Transfer stock alerting failed', tenantId, error)
  }
}

/**
 * Draft a transfer. Nothing moves — the stock is still on the sender's shelf
 * and the document only says what is intended to leave it.
 *
 * No price is written on the lines. The ledger freezes every leg's cost itself
 * (the departure at the sender's average, the arrival and any shortfall at the
 * departure's), so a price change between sending and arriving cannot revalue
 * stock on a van, and a draft needs no read of what the ingredient costs
 * (`unit_cost` is not selectable by the session role, only `costs` holders may
 * ask for it). `stock_transfer_lines.unit_cost` stays NULL on new lines.
 */
export async function createTransfer(
  tenantId: string,
  input: CreateTransferInput,
): Promise<{ id: string }> {
  return createTransferWith(await createClient(), tenantId, input)
}

/**
 * The same step, performed with a client the caller already holds.
 *
 * This exists for the merchant app, which authenticates with a Bearer token
 * rather than the cookies `@/lib/supabase/server` reads. Handed a cookie client
 * the app's request would resolve no session at all, and
 * `resolveActingBranchScope` would then be deciding branch authority for
 * nobody — which is precisely the check that stops one shop emptying another's
 * shelf. Injecting the caller's own client keeps that check pointed at the real
 * caller. Same split, same reason, as `recordStockMovementWith`.
 */
export async function createTransferWith(
  supabase: StockActorClient,
  tenantId: string,
  input: CreateTransferInput,
): Promise<{ id: string }> {
  const scope = await resolveActingBranchScope(supabase, tenantId)

  // Authority and shape both settled before anything is written, so a refused
  // transfer leaves no half-document behind.
  if (!canSendTransfer(scope, input.fromOutletId)) throw new Error(NOT_YOUR_BRANCH)
  validateTransferDraft(input)

  const { data: created, error: createError } = await supabase
    .from('stock_transfers')
    .insert({
      tenant_id: tenantId,
      from_outlet_id: input.fromOutletId,
      to_outlet_id: input.toOutletId,
      status: 'draft',
      note: input.note ?? null,
    } as never)
    .select('id')
    .single()
  if (createError) throw createError

  const transferId = (created as unknown as { id: string }).id

  const { error: lineError } = await supabase.from('stock_transfer_lines').insert(
    input.lines.map((line) => ({
      tenant_id: tenantId,
      transfer_id: transferId,
      inventory_item_id: line.inventoryItemId,
      sent_quantity: line.quantity,
    })) as never,
  )
  if (lineError) throw lineError

  return { id: transferId }
}

/**
 * Send it. The stock leaves the source shelf and is on neither branch until
 * somebody counts it in.
 */
export async function sendTransfer(tenantId: string, transferId: string): Promise<void> {
  return sendTransferWith(await createClient(), tenantId, transferId)
}

/** As `sendTransfer`, with the caller's own client. See `createTransferWith`. */
export async function sendTransferWith(
  supabase: StockActorClient,
  tenantId: string,
  transferId: string,
): Promise<void> {
  const transfer = await loadTransfer(supabase, tenantId, transferId)

  // The transition check is what stops a stale tab deducting the stock twice.
  assertTransferTransition(transfer.status, 'sent')
  if (!canSendTransfer(await resolveActingBranchScope(supabase, tenantId), transfer.from_outlet_id)) {
    throw new Error(NOT_YOUR_BRANCH)
  }

  const lines = await loadLines(supabase, tenantId, transferId)
  const movements = buildSendMovements({
    fromOutletId: transfer.from_outlet_id,
    lines: toReceipts(lines),
  })

  await applyTransferStep(supabase, tenantId, movements, () =>
    supabase.rpc('send_stock_transfer' as never, {
      p_transfer_id: transferId,
      p_legs: toLegPayload(movements),
    } as never),
  )
}

/**
 * Count it in. `counts` is what is physically on the receiving bench, keyed by
 * ingredient — not what the paperwork claims, which is the entire point.
 *
 * A shortfall posts as shrinkage against the SENDING branch. See
 * `buildReceiveMovements` for why that is the only end it can fairly land on.
 */
export async function receiveTransfer(
  tenantId: string,
  transferId: string,
  counts: Readonly<Record<string, number>>,
): Promise<void> {
  return receiveTransferWith(await createClient(), tenantId, transferId, counts)
}

/** As `receiveTransfer`, with the caller's own client. See `createTransferWith`. */
export async function receiveTransferWith(
  supabase: StockActorClient,
  tenantId: string,
  transferId: string,
  counts: Readonly<Record<string, number>>,
): Promise<void> {
  const transfer = await loadTransfer(supabase, tenantId, transferId)

  assertTransferTransition(transfer.status, 'received')
  if (!canReceiveTransfer(await resolveActingBranchScope(supabase, tenantId), transfer.to_outlet_id)) {
    throw new Error(NOT_YOUR_BRANCH)
  }

  const lines = await loadLines(supabase, tenantId, transferId)
  // Both of these throw before a single row is written: an uncounted line, a
  // count for something not on the transfer, or a count larger than what was
  // sent all leave the transfer exactly as it was.
  const counted = resolveReceiptLines(toReceipts(lines), counts)
  const movements = buildReceiveMovements({
    fromOutletId: transfer.from_outlet_id,
    toOutletId: transfer.to_outlet_id,
    lines: counted,
  })

  // The legs, what arrived per line and the status change are one step: a
  // failure between them used to strand a half-received transfer.
  const receivedByItem = Object.fromEntries(
    counted.map((line) => [line.inventoryItemId, line.receivedQuantity]),
  )
  await applyTransferStep(supabase, tenantId, movements, () =>
    supabase.rpc('receive_stock_transfer' as never, {
      p_transfer_id: transferId,
      p_legs: toLegPayload(movements),
      p_counts: receivedByItem,
    } as never),
  )
}

/**
 * Abandon a draft.
 *
 * Only a draft: once sent, the stock is off the source shelf and a status flip
 * would not put it back. `assertTransferTransition` is what says so.
 */
export async function cancelTransfer(tenantId: string, transferId: string): Promise<void> {
  return cancelTransferWith(await createClient(), tenantId, transferId)
}

/** As `cancelTransfer`, with the caller's own client. See `createTransferWith`. */
export async function cancelTransferWith(
  supabase: StockActorClient,
  tenantId: string,
  transferId: string,
): Promise<void> {
  const transfer = await loadTransfer(supabase, tenantId, transferId)

  assertTransferTransition(transfer.status, 'cancelled')
  if (!canSendTransfer(await resolveActingBranchScope(supabase, tenantId), transfer.from_outlet_id)) {
    throw new Error(NOT_YOUR_BRANCH)
  }

  const { error } = await supabase
    .from('stock_transfers')
    .update({ status: 'cancelled' } as never)
    .eq('tenant_id', tenantId)
    .eq('id', transferId)
  if (error) throw error
}
