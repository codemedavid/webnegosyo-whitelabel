/**
 * Signed links for an expense's receipt photos, so the detail screen can draw
 * thumbnails. The bucket is private: each link comes from the existing
 * `GET /api/expenses/receipts/link` route with the caller's own session
 * (`fetchReceiptLink`), which checks the person may read that expense.
 *
 * Links live 5 minutes on the server, so the cache keeps them for 4. PDFs are
 * never signed here: they open in the browser on tap, signed at that moment.
 */

import { useCallback } from "react";

import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import type { ExpenseReceiptRef } from "./expense-service";
import { fetchReceiptLink } from "./live-expense-queue";

export const EXPENSE_RECEIPT_LINKS_RESOURCE = "expense-receipt-links";
const LINK_STALE_MS = 4 * 60_000;
const PDF_MIME = "application/pdf";
const NO_LINKS: Readonly<Record<string, string | null>> = Object.freeze({});

/** Receipt id → signed url (null = could not be signed; the tile says so). */
export async function signReceiptIds(
  receiptIds: readonly string[],
  sign: (receiptId: string) => ReturnType<typeof fetchReceiptLink> = fetchReceiptLink,
): Promise<Record<string, string | null>> {
  const answers = await Promise.all(
    receiptIds.map(async (receiptId) => {
      const link = await sign(receiptId).catch(() => null);
      return [receiptId, link?.status === "ok" ? link.url : null] as const;
    }),
  );
  return Object.fromEntries(answers);
}

export function useReceiptLinks(
  tenantId: string | null,
  receipts: readonly ExpenseReceiptRef[],
): { links: Readonly<Record<string, string | null>>; isLoading: boolean; refetch: () => Promise<void> } {
  const ids = receipts.filter((receipt) => receipt.mime !== PDF_MIME).map((receipt) => receipt.id);
  // `receipts` is a fresh array on every detail read; the ids decide when to re-sign.
  const idKey = ids.join(",");
  const fetcher = useCallback(() => signReceiptIds(idKey ? idKey.split(",") : []), [idKey]);
  const result = useResource<Record<string, string | null>>(
    tenantId && ids.length > 0 ? resourceKey(EXPENSE_RECEIPT_LINKS_RESOURCE, tenantId, idKey) : null,
    fetcher,
    { staleTime: LINK_STALE_MS },
  );
  return { links: result.data ?? NO_LINKS, isLoading: result.isLoading, refetch: result.refetch };
}
