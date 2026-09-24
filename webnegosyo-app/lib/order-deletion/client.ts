/**
 * The merchant app's side of owner-initiated order deletion.
 *
 * Everything happens on the web app — the export, the password re-check, the
 * deletion and the restore — authenticated with the owner's own access token.
 * The routes re-verify that the account owns the store and that the store's
 * orders live on the platform database; this module only carries the request.
 * Shapes mirror src/lib/order-deletion/types.ts on the web side.
 */
import { fetchWithTimeout, type FetchLike } from "../fetch-timeout";

export type DeletionScope =
  | { kind: "range"; from: string; to: string }
  | { kind: "all" }
  | { kind: "selected"; orderIds: string[] };

export interface DeletionRequest {
  scope: DeletionScope;
  includeActive: boolean;
}

export interface DeletionPreview {
  orderCount: number;
  orderTotal: number;
  activeCount: number;
  earliest: string | null;
  latest: string | null;
}

export interface ListedOrder {
  id: string;
  created_at: string;
  daily_number: number | null;
  status: string;
  customer_name: string | null;
  total: number;
}

export interface DownloadedExport {
  deletionId: string;
  csv: string;
  fileName: string;
  orderCount: number;
  orderTotal: number;
  expiresAt: string;
}

export interface ExecuteResult {
  deleted: number;
  skipped: number;
  total: number;
  purgeAfter: string;
}

export type DeletionStatus = "exported" | "deleted" | "restored" | "purged" | "expired";

export interface DeletionRecord {
  id: string;
  status: DeletionStatus;
  scope: DeletionScope;
  order_count: number;
  order_total: number;
  exported_at: string;
  deleted_at: string | null;
  deleted_order_count: number | null;
  purge_after: string | null;
}

interface ClientDeps {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
}

/** Deleting thousands of orders can take a while; reads get the usual deadline. */
const WRITE_TIMEOUT_MS = 60_000;
const READ_TIMEOUT_MS = 20_000;

/**
 * `Response.text()` decodes UTF-8 and drops a leading byte-order mark, and
 * without it Excel reads the file as ANSI and mangles peso signs and accents.
 */
function withByteOrderMark(text: string): string {
  return text.startsWith("\uFEFF") ? text : `\uFEFF${text}`;
}

async function readError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(body.error ?? `Request failed (${response.status}).`);
  } catch {
    return new Error(`Request failed (${response.status}).`);
  }
}

export function createOrderDeletionClient({ baseUrl, getToken, fetchImpl = fetch }: ClientDeps) {
  async function send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const token = await getToken();
    if (!token) throw new Error("Your session has ended. Sign in again to continue.");
    const response = await fetchWithTimeout(
      `${baseUrl}${path}`,
      {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      },
      timeoutMs,
      fetchImpl
    );
    if (!response.ok) throw await readError(response);
    return response;
  }

  function post(path: string, body: unknown): Promise<Response> {
    return send(
      path,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      WRITE_TIMEOUT_MS
    );
  }

  return {
    async preview(tenantId: string, request: DeletionRequest, listOrders = false) {
      const response = await post("/api/order-deletion/preview", { tenantId, ...request, listOrders });
      return (await response.json()) as { preview: DeletionPreview; orders?: ListedOrder[]; truncated?: boolean };
    },

    async exportOrders(tenantId: string, request: DeletionRequest): Promise<DownloadedExport> {
      const response = await post("/api/order-deletion/export", { tenantId, ...request });
      const deletionId = response.headers.get("X-Order-Deletion-Id");
      if (!deletionId) throw new Error("The export did not include a deletion ticket. Try again.");
      return {
        deletionId,
        csv: withByteOrderMark(await response.text()),
        fileName: response.headers.get("X-Export-File-Name") ?? "orders-backup.csv",
        orderCount: Number(response.headers.get("X-Order-Count") ?? 0),
        orderTotal: Number(response.headers.get("X-Order-Total") ?? 0),
        expiresAt: response.headers.get("X-Export-Expires-At") ?? "",
      };
    },

    async confirm(
      tenantId: string,
      input: { deletionId: string; password: string; confirmation: string }
    ): Promise<ExecuteResult> {
      const response = await post("/api/order-deletion/confirm", { tenantId, ...input });
      return ((await response.json()) as { result: ExecuteResult }).result;
    },

    async restore(tenantId: string, deletionId: string): Promise<{ restored: number }> {
      const response = await post("/api/order-deletion/restore", { tenantId, deletionId });
      return ((await response.json()) as { result: { restored: number } }).result;
    },

    async history(tenantId: string): Promise<DeletionRecord[]> {
      const response = await send(
        `/api/order-deletion?tenantId=${encodeURIComponent(tenantId)}`,
        { method: "GET" },
        READ_TIMEOUT_MS
      );
      return ((await response.json()) as { deletions: DeletionRecord[] }).deletions;
    },
  };
}

export type OrderDeletionClient = ReturnType<typeof createOrderDeletionClient>;
