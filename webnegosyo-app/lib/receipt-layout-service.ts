import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeLayoutForSave } from "./receipt-editor";
import type { ReceiptLayout, ReceiptPresetName } from "./receipt-layout";

/**
 * Reading and publishing a store's receipt layout from the phone.
 *
 * `tenants.receipt_layout` is written as the signed-in admin, straight through
 * RLS (`tenants_write_admin`) — the column is not one the privileged-column
 * guard locks, and the web Studio's server action writes the same value. Two
 * things the direct write must do that a server action got for free:
 *
 *  - validate before sending (`sanitizeLayoutForSave`) — the printer falls
 *    back to Modern on anything invalid, so a bad save silently throws the
 *    merchant's design away;
 *  - confirm a row actually changed. RLS does not ERROR on an update it
 *    filters out, it matches zero rows, so without `.select()` a staff account
 *    outside the policy would see "Published" and print the old receipt.
 *
 * Both calls are bounded: a hung request here holds a spinner on a merchant
 * standing at the counter.
 */

export const RECEIPT_REQUEST_TIMEOUT_MS = 8_000;

type TenantsClient = Pick<SupabaseClient, "from">;

export type SaveFailureReason = "invalid" | "refused" | "timeout" | "failed";

export type SaveReceiptOutcome =
  | { ok: true; saved: ReceiptPresetName | ReceiptLayout }
  | { ok: false; reason: SaveFailureReason; message: string };

export type FetchReceiptOutcome =
  | { ok: true; layout: unknown; logoUrl: string | null }
  | { ok: false };

const FAILURE_MESSAGES: Record<SaveFailureReason, string> = {
  invalid: "This layout can't be printed. Undo your last change and try again.",
  refused: "Your account can't change the store's receipt. Ask the owner to publish it.",
  timeout: "Publishing is taking too long. Check your connection and try again.",
  failed: "Couldn't publish. Check your connection and try again.",
};

const PERMISSION_DENIED = "42501";

function failure(reason: SaveFailureReason): SaveReceiptOutcome {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

class RequestTimeout extends Error {}

/** Run `request` with an abort signal, rejecting with RequestTimeout at the deadline. */
async function bounded<T>(request: (signal: AbortSignal) => PromiseLike<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted AND raced: React Native's fetch has not always turned an abort
  // into a rejection, and the race is what guarantees the caller settles.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeout());
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(request(controller.signal)), expiry]);
  } finally {
    clearTimeout(timer);
  }
}

export async function saveReceiptLayout(
  client: TenantsClient,
  tenantId: string,
  payload: unknown,
  timeoutMs: number = RECEIPT_REQUEST_TIMEOUT_MS,
): Promise<SaveReceiptOutcome> {
  const sanitized = sanitizeLayoutForSave(payload);
  if (sanitized === null) return failure("invalid");

  try {
    const { data, error } = await bounded(
      (signal) =>
        client
          .from("tenants")
          // Structured-clone through JSON: the jsonb column wants plain data.
          .update({ receipt_layout: JSON.parse(JSON.stringify(sanitized)) })
          .eq("id", tenantId)
          .select("id")
          .abortSignal(signal),
      timeoutMs,
    );
    if (error) {
      console.warn("[receipt-layout] publish failed:", error.code, error.message);
      return failure(error.code === PERMISSION_DENIED ? "refused" : "failed");
    }
    if (!Array.isArray(data) || data.length === 0) return failure("refused");
    return { ok: true, saved: sanitized };
  } catch (err: unknown) {
    if (err instanceof RequestTimeout) return failure("timeout");
    console.warn("[receipt-layout] publish failed:", err instanceof Error ? err.message : err);
    return failure("failed");
  }
}

/**
 * The layout the store has saved right now. The session snapshot is taken at
 * sign-in, so a design published on the web since then would otherwise open
 * stale here — and publishing over it would quietly undo the web edit.
 */
export async function fetchReceiptLayout(
  client: TenantsClient,
  tenantId: string,
  timeoutMs: number = RECEIPT_REQUEST_TIMEOUT_MS,
): Promise<FetchReceiptOutcome> {
  try {
    const { data, error } = await bounded(
      (signal) =>
        client
          .from("tenants")
          .select("receipt_layout, logo_url")
          .eq("id", tenantId)
          .abortSignal(signal)
          .maybeSingle(),
      timeoutMs,
    );
    if (error || !data) return { ok: false };
    const row = data as { receipt_layout?: unknown; logo_url?: string | null };
    return { ok: true, layout: row.receipt_layout ?? null, logoUrl: row.logo_url ?? null };
  } catch {
    return { ok: false };
  }
}
