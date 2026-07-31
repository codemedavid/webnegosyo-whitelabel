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
