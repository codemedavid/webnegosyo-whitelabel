/**
 * Moving stock between shops, from the phone.
 *
 * **The write goes through the platform; the read goes straight to Supabase.**
 * That looks inconsistent and is deliberate. A transfer write is two ledger
 * legs that have to agree, a status transition that stops a stale screen
 * sending the same load twice, and a source unit cost frozen at send time — a
 * client composing those itself would get them wrong one leg at a time, and RLS
 * cannot check any of them. A read is only rows the merchant's own RLS already
 * decides they may see, so routing it through the server would add a hop that
 * protects nothing.
 *
 * Failures on the write surface, following `inventory-movement-service.ts` and
 * deliberately unlike `pos-stock-notify.ts`: nothing here runs behind a tender
 * that must not be blocked. Somebody is standing at a bench waiting to be told
 * their count landed, and a swallowed error would show them a confirmation for
 * a write that never happened — which they would discover much later, as
 * somebody else's shrinkage.
 */

import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { TransferStatus, TransferSummary } from "./inventory-transfers";

function getWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

/** One line of a draft, in stock units. */
export interface TransferLineInput {
  inventoryItemId: string;
  quantity: number;
}

/**
 * A step in a transfer's life. `counts` belongs only to `receive` — it is what
 * is physically on the bench, which is the entire reason that step exists.
 */
export type TransferStep =
  | {
      action: "create";
      fromOutletId: string | null;
      toOutletId: string | null;
      lines: readonly TransferLineInput[];
      note?: string;
    }
  | { action: "send"; transferId: string }
  | { action: "receive"; transferId: string; counts: Readonly<Record<string, number>> }
  | { action: "cancel"; transferId: string };

/**
 * Perform one step. Throws with a message worth showing the merchant — the
 * server's own wording, not a generic failure, because "you can only move stock
 * in and out of your own branch" is the one refusal a branch manager most needs
 * to read.
 */
export async function submitTransferStep(
  tenantId: string,
  step: TransferStep,
): Promise<{ id?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Checked before the request so an expired session reads as "sign in again"
  // rather than as a rejection of the count they just took.
  if (!token) throw new Error("Your session has expired. Sign in and try again.");

  let response: Response;
  try {
    response = await fetch(`${getWebAppUrl()}/api/inventory/transfers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenantId, ...step }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? "The transfer could not be updated");
  }

  return { id: body?.id };
}

interface TransferRow {
  id: string;
  status: TransferStatus;
  from_outlet_id: string | null;
  to_outlet_id: string | null;
  created_at: string;
  stock_transfer_lines?: { id: string }[] | null;
}

const TRANSFER_COLUMNS =
  "id, status, from_outlet_id, to_outlet_id, created_at, stock_transfer_lines(id)";

/**
 * The transfers this account may see, newest-fetched and left unsorted —
 * `sortTransfersForBench` decides the order, so the rule lives in one pure
 * place rather than half here and half in a query.
 *
 * A failed read yields an empty list rather than throwing. Unlike the write,
 * nobody is waiting on a specific answer, and this list shares a screen with
 * the shelf: a crash here would take the merchant's stock figures down with it.
 */
export async function loadTransfers(tenantId: string): Promise<TransferSummary[]> {
  if (!tenantId) return [];

  const { data, error } = await supabase
    .from("stock_transfers")
    .select(TRANSFER_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return [];

  return ((data ?? []) as unknown as TransferRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    fromOutletId: row.from_outlet_id,
    toOutletId: row.to_outlet_id,
    lineCount: row.stock_transfer_lines?.length ?? 0,
    createdAt: row.created_at,
  }));
}

/** One line of a consignment, as the bench has to count it. */
export interface TransferLineView {
  inventoryItemId: string;
  name: string;
  sentQuantity: number;
  /** Empty when the unit cannot be resolved — see `loadTransferLines`. */
  unitAbbreviation: string;
}

interface TransferLineRow {
  transfer_id: string;
  inventory_item_id: string;
  sent_quantity: number;
  inventory_items?: {
    name?: string | null;
    inventory_units?: { abbreviation?: string | null } | null;
  } | null;
}

const LINE_COLUMNS =
  "transfer_id, inventory_item_id, sent_quantity, inventory_items(name, inventory_units(abbreviation))";

/**
 * Every line of every transfer this account may see, grouped by transfer.
 *
 * Grouped and fetched in one go rather than per consignment, so the bench panel
 * can look a transfer's lines up synchronously the moment it is expanded.
 * Fetching on tap would leave an empty box on the screen of somebody standing
 * in a stockroom with two bars of signal, which is exactly where this is used.
 *
 * A line whose unit cannot be resolved keeps its name and loses only the
 * abbreviation. The name is what the merchant matches against what is in the
 * box; a nameless row is one they cannot count at all.
 *
 * A failed read yields nothing rather than throwing, like `loadTransfers` and
 * for the same reason: this shares a screen with the shelf.
 */
export async function loadTransferLines(
  tenantId: string,
): Promise<Record<string, TransferLineView[]>> {
  if (!tenantId) return {};

  const { data, error } = await supabase
    .from("stock_transfer_lines")
    .select(LINE_COLUMNS)
    .eq("tenant_id", tenantId);

  if (error) return {};

  const byTransfer: Record<string, TransferLineView[]> = {};
  for (const row of (data ?? []) as unknown as TransferLineRow[]) {
    const line: TransferLineView = {
      inventoryItemId: row.inventory_item_id,
      name: row.inventory_items?.name ?? "",
      sentQuantity: row.sent_quantity,
      unitAbbreviation: row.inventory_items?.inventory_units?.abbreviation ?? "",
    };
    byTransfer[row.transfer_id] = [...(byTransfer[row.transfer_id] ?? []), line];
  }

  return byTransfer;
}
