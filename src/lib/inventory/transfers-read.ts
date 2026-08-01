/**
 * Reading transfers for a screen.
 *
 * Goes through the RLS-enforcing server client, like `getBranchStockIndex` and
 * unlike the order pipeline's service-role writes. That is what limits the rows
 * to transfers this account may see — the `stock_transfers` policy admits an
 * account at EITHER end, because a transfer is a conversation between two
 * branches and hiding it from one of them makes a shortfall unexplainable.
 *
 * The ingredient name is joined in rather than resolved on the client. A
 * transfer listing raw item ids is a document nobody can check against a
 * physical box, which is the only thing a transfer is ever checked against.
 */

import { createClient } from '@/lib/supabase/server'
import type { TransferListItem, TransferLineView } from '@/lib/inventory/transfers-view'
import type { StockTransferStatus } from '@/lib/inventory/stock-transfer'

/** Enough to work through a backlog without an unbounded read. */
const TRANSFER_LIMIT = 100

/** The joined shape, as Supabase returns it. */
interface TransferLineRow {
  inventory_item_id: string
  sent_quantity: number | string
  received_quantity: number | string | null
  inventory_items?: { name?: string | null; stock_unit?: { abbreviation?: string | null } | null } | null
}

interface TransferRow {
  id: string
  status: StockTransferStatus
  from_outlet_id: string | null
  to_outlet_id: string | null
  created_at: string
  note: string | null
  stock_transfer_lines: TransferLineRow[] | null
}

/**
 * NUMERIC(16,4) arrives as a string. Comparing a string sent quantity against a
 * numeric received one reports every clean transfer as short, so both are
 * coerced at the boundary rather than at each comparison.
 */
function toNumber(value: number | string | null): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function toLine(row: TransferLineRow): TransferLineView {
  return {
    inventoryItemId: row.inventory_item_id,
    name: row.inventory_items?.name ?? 'Ingredient',
    unit: row.inventory_items?.stock_unit?.abbreviation ?? '',
    sentQuantity: toNumber(row.sent_quantity),
    // Null, never zero: an uncounted line is a question nobody has asked, and
    // zero would read as "nothing arrived" on a delivery nobody has looked at.
    receivedQuantity: row.received_quantity === null ? null : toNumber(row.received_quantity),
  }
}

/**
 * This tenant's transfers, newest first.
 *
 * Returns an empty list rather than throwing: this renders alongside the
 * inventory page, which works without it, and a failed transfer read must not
 * take the stock screen down with it.
 */
export async function listTransfers(tenantId: string): Promise<TransferListItem[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('stock_transfers')
      .select(
        `id, status, from_outlet_id, to_outlet_id, created_at, note,
         stock_transfer_lines (
           inventory_item_id, sent_quantity, received_quantity,
           inventory_items ( name, stock_unit:inventory_units ( abbreviation ) )
         )`,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(TRANSFER_LIMIT)

    if (error) {
      console.error('[inventory] Transfer read failed', tenantId, error)
      return []
    }

    return ((data ?? []) as unknown as TransferRow[]).map((row) => ({
      id: row.id,
      status: row.status,
      fromOutletId: row.from_outlet_id,
      toOutletId: row.to_outlet_id,
      createdAt: row.created_at,
      note: row.note,
      lines: (row.stock_transfer_lines ?? []).map(toLine),
    }))
  } catch (error) {
    console.error('[inventory] Transfer read failed', tenantId, error)
    return []
  }
}
