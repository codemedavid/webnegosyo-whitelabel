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
  unit_cost: number | null
}

export interface CreateTransferInput {
  fromOutletId: string | null
  toOutletId: string | null
  lines: readonly TransferLineDraft[]
  note?: string
}

/** The message both refusals share, because from the merchant's side it is one rule. */
const NOT_YOUR_BRANCH = 'You can only move stock in and out of your own branch'

/**
 * Who performed this step, or nobody.
 *
 * Never throws, and that is load-bearing rather than defensive: by the time
 * this is called the ledger legs are already written, so an identity lookup
 * that threw would leave the stock moved and the document still saying it had
 * not been. An unattributed transfer is a much smaller problem than a transfer
 * whose paperwork disagrees with the shelf.
 */
async function actingUserId(supabase: StockActorClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

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
    .select('inventory_item_id, sent_quantity, received_quantity, unit_cost')
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
    unitCost: line.unit_cost === null ? undefined : Number(line.unit_cost),
  }))
}

/**
 * Write the legs.
 *
 * `entered_quantity` is the magnitude and `entered_unit_id` is left null: a
 * transfer is between two shelves of the same store, so both figures are
 * already in the item's stock unit and there is no unit the merchant typed.
 */
async function writeMovements(
  supabase: StockActorClient,
  tenantId: string,
  transferId: string,
  movements: readonly TransferMovement[],
): Promise<void> {
  if (movements.length === 0) return

  const { error } = await supabase.from('stock_movements').insert(
    movements.map((movement) => ({
      tenant_id: tenantId,
      inventory_item_id: movement.inventoryItemId,
      outlet_id: movement.outletId,
      reason: movement.reason,
      quantity_delta: movement.quantityDelta,
      entered_quantity: Math.abs(movement.quantityDelta),
      unit_cost: movement.unitCost ?? null,
      note: movement.note ?? null,
      stock_transfer_id: transferId,
    })) as never,
  )
  if (error) throw error
}

/**
 * Draft a transfer. Nothing moves — the stock is still on the sender's shelf
 * and the document only says what is intended to leave it.
 *
 * The source branch's unit cost is frozen onto each line here rather than read
 * again at receipt, so a price change between sending and arriving cannot
 * revalue stock that is already on a van.
 */
export async function createTransfer(
  tenantId: string,
  input: CreateTransferInput,
): Promise<{ id: string }> {
  const supabase = await createClient()
  const scope = await resolveActingBranchScope(supabase, tenantId)

  // Authority and shape both settled before anything is written, so a refused
  // transfer leaves no half-document behind.
  if (!canSendTransfer(scope, input.fromOutletId)) throw new Error(NOT_YOUR_BRANCH)
  validateTransferDraft(input)

  const itemIds = input.lines.map((line) => line.inventoryItemId)
  const { data: itemRows, error: itemError } = await supabase
    .from('inventory_items')
    .select('id, unit_cost')
    .eq('tenant_id', tenantId)
    .in('id', itemIds)
  if (itemError) throw itemError

  const costByItemId = new Map(
    ((itemRows ?? []) as unknown as Array<{ id: string; unit_cost: number | null }>).map(
      (row) => [row.id, row.unit_cost],
    ),
  )

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
      unit_cost: costByItemId.get(line.inventoryItemId) ?? null,
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
  const supabase = await createClient()
  const transfer = await loadTransfer(supabase, tenantId, transferId)

  // The transition check is what stops a stale tab deducting the stock twice.
  assertTransferTransition(transfer.status, 'sent')
  if (!canSendTransfer(await resolveActingBranchScope(supabase, tenantId), transfer.from_outlet_id)) {
    throw new Error(NOT_YOUR_BRANCH)
  }

  const lines = await loadLines(supabase, tenantId, transferId)
  await writeMovements(
    supabase,
    tenantId,
    transferId,
    buildSendMovements({ fromOutletId: transfer.from_outlet_id, lines: toReceipts(lines) }),
  )

  const { error } = await supabase
    .from('stock_transfers')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: await actingUserId(supabase),
    } as never)
    .eq('tenant_id', tenantId)
    .eq('id', transferId)
  if (error) throw error
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
  const supabase = await createClient()
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

  await writeMovements(supabase, tenantId, transferId, movements)

  // Per line, because each one carries its own count. This is the record of
  // what arrived; without it the ledger says stock went missing and nothing
  // says at which step it was noticed.
  for (const line of counted) {
    const { error } = await supabase
      .from('stock_transfer_lines')
      .update({ received_quantity: line.receivedQuantity } as never)
      .eq('tenant_id', tenantId)
      .eq('transfer_id', transferId)
      .eq('inventory_item_id', line.inventoryItemId)
    if (error) throw error
  }

  const { error } = await supabase
    .from('stock_transfers')
    .update({
      status: 'received',
      received_at: new Date().toISOString(),
      received_by: await actingUserId(supabase),
    } as never)
    .eq('tenant_id', tenantId)
    .eq('id', transferId)
  if (error) throw error
}

/**
 * Abandon a draft.
 *
 * Only a draft: once sent, the stock is off the source shelf and a status flip
 * would not put it back. `assertTransferTransition` is what says so.
 */
export async function cancelTransfer(tenantId: string, transferId: string): Promise<void> {
  const supabase = await createClient()
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
