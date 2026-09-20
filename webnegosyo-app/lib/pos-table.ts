/**
 * The table attached to a register sale. Mirrors lib/pos-delivery.ts: a slice
 * on the cart store, cleared with the sale, folded into the order's
 * customerData at tender under the same `table_number` key the web checkout
 * writes — so the order card, the kitchen ticket, the receipt and the floor
 * plan all see a POS sale's table exactly as they see a web order's.
 */

import { DINE_IN_ORDER_TYPE_KIND } from "./dine-in";
import { normalizeTableNumber, TABLE_NUMBER_FIELD_NAME } from "./order-table-number";

export const PARTY_SIZE_FIELD_NAME = "party_size";

export interface PosTableDetails {
  /** As chosen or typed; normalized only when written to the order. */
  label: string | null;
  /** The floor-plan row, when the cashier picked one rather than typing. */
  tableId: string | null;
  partySize: number | null;
}

export interface ClearedSaleTable {
  table: PosTableDetails;
}

export function clearedSaleTable(): ClearedSaleTable {
  return { table: { label: null, tableId: null, partySize: null } };
}

export function tableCustomerData(
  table: PosTableDetails | null | undefined,
): Record<string, string | number> {
  const label = table?.label ? normalizeTableNumber(table.label) : "";
  if (label === "") return {};
  return {
    [TABLE_NUMBER_FIELD_NAME]: label,
    ...(typeof table?.partySize === "number" && table.partySize > 0
      ? { [PARTY_SIZE_FIELD_NAME]: table.partySize }
      : {}),
  };
}

export function isDineInType(orderType: { type: string } | null | undefined): boolean {
  return orderType?.type === DINE_IN_ORDER_TYPE_KIND;
}
