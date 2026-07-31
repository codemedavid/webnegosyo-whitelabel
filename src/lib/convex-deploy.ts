import { promisify } from "util";
import * as zlib from "zlib";
import convexPushBundle from "./convex-push-bundle.json";

const brotliCompress = promisify(zlib.brotliCompress);

// v10: Lalamove v3 hardening — convex/lalamove.ts now signs requests with a
// correct HMAC-SHA256 signature (was sending the raw secret → prod 401s), wraps
// payloads in the v3 `{ data }` envelope, retrieves the quotation for real stop
// IDs, and uses the store's pickup contact as sender (config lalamove_sender_phone
// + restaurant_name). Adds cancelLalamove, addLalamovePriorityFee, and
// syncLalamoveStatus actions consumed by the merchant app. Bumping forces
// bulkDeployConvexAction to re-push every tenant.
// v9: POS / counter sales — orders.source now accepts "pos". POS orders are
// auto-confirmed (skip the pending queue) and skip the new-order push, like
// qr_handoff, since the merchant rings them up on the device they're holding.
// Bumping forces bulkDeployConvexAction to re-push every tenant.
// v8: QR-handoff orders are now auto-confirmed (status "confirmed" instead of
// "pending") and skip the new-order push notification, since the merchant
// creates them by scanning + sliding to accept on the device they're holding.
// v7: QR handoff (orders.source "qr_handoff", clientOrderId + by_client_order_id
// index + getOrderByClientId) PLUS analytics correctness — cancelled orders
// excluded from dashboard/trends revenue, getTrends now computed LIVE from orders
// (self-corrects on cancellation), PH-local day boundaries (time.ts),
// getAllOrderItems, and the de-N+1'd product analytics aggregator. Bumping forces
// bulkDeployConvexAction to re-push every tenant.
// v11: new-order push now fires for EVERY order (pickup/delivery/counter) instead
// of skipping qr_handoff/pos, and the push payload targets the high-importance
// "orders" Android channel (channelId) so it rings the custom ringtone.
// v12: getCustomerInsights no longer counts anonymous walk-in/POS orders
// (placeholder contacts: "POS", "walk-in", blank…) as customers — they were
// collapsing into one fake customer entry. They're reported separately as
// walkInOrders/walkInRevenue, and per-customer averages cover identified
// customers only (customerIdentity.ts).
// v13: getCustomerInsights now resolves a canonical identity per order via
// resolveAnalyticsContact (customerIdentity.ts) — normalized PH E.164 phone,
// then email, from customerContact OR customerData. Recovers legacy orders whose
// identity lived only in customerData and merges cross-channel phone formats
// (09... vs +639...), fixing the "1 customer" undercount without a data backfill.
// v14: order editing. Adds the orderPayments ledger and orderRevisions audit
// tables, plus amountPaid/revisionNumber/editedAt/editedBy on orders, and the
// reviseOrder / recordPayment mutations behind them. Convex has no triggers,
// so recordPayment maintains the amountPaid cache inside its own transaction —
// the platform backend gets the same guarantee from a database trigger.
// v15: branch-targeted push. pushTokens.outletId binds a device to a branch, and
// sendOrderNotification now rings only the devices matching the order's branch
// (read from customerData.outlet_id) instead of every registered device — a
// two-branch store woke both branches for every sale. Absent on either side
// means store-wide, so an owner's phone, a token from an older app build, and a
// single-location store all keep hearing everything. Rule in pushRecipients.ts.
// v15 also adds orders.outletId + a by_outlet index, promoted out of
// customerData.outlet_id on create, and an optional outletId argument on
// getOrders/getRealtimeQueue so a branch-scoped device stops receiving other
// branches' rows. Filtering resolves column-then-blob and over-fetches, because
// orders written before v15 carry the branch only in customerData — an indexed
// lookup on the column alone would hide every one of them.
// v16 moves the order-edit rules out of the reviseOrder/recordPayment handlers
// and into orderRevise.ts, which is Convex-import-free and therefore unit
// tested — those handlers previously had no automated coverage at all. Behaviour
// is unchanged except for one fix: a line's subtotal is now computed from the
// price actually stored (round2(price) x quantity) rather than from the raw
// submitted price, so an edited receipt always adds up.
// v17 refuses an edit once the kitchen has started (`preparing` onward). The
// screen gate alone was a UI preference, not a rule: an edit screen opened
// while an order was still `confirmed` survived the kitchen starting, and its
// save would otherwise still land.
// v18 lets `getDashboardStatsByPeriod` take an optional `outletId`, so a branch
// manager's takings can be narrowed to the shelf their stock report covers.
// Until this, the inventory report had to withhold their food cost entirely:
// branch stock over store-wide takings understates it by roughly the number of
// branches, and an understated food cost gets believed rather than
// investigated. The argument is OPTIONAL and the client sends it only to
// deployments recorded at >= 18 — a validator rejects arguments it does not
// know, which surfaces as "this store needs a backend update".
const CURRENT_SCHEMA_VERSION = 18;
const SCHEMA_POLL_TIMEOUT_MS = 10_000;
const MAX_SCHEMA_WAIT_MS = 120_000;

interface DeployResult {
  success: boolean;
  error?: string;
  schemaVersion: number;
}

interface ModuleConfig {
  path: string;
  source: string;
  sourceMap?: string;
  environment: "isolate" | "node";
}

interface PushBundle {
  functions: string;
  appDefinition: {
    definition: null;
    dependencies: string[];
    schema: ModuleConfig | null;
    changedModules: ModuleConfig[];
    unchangedModuleHashes: never[];
    udfServerVersion: string;
  };
  componentDefinitions: never[];
  nodeDependencies: never[];
}

/**
 * Make an authenticated request to the Convex deployment API.
 */
async function convexFetch(
  deploymentUrl: string,
  adminKey: string,
  endpoint: string,
  body: unknown,
  options?: { compress?: boolean }
): Promise<Response> {
  const jsonBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    Authorization: `Convex ${adminKey}`,
    "Content-Type": "application/json",
  };

  let requestBody: Uint8Array | string;
  if (options?.compress) {
    const compressed = await brotliCompress(jsonBody, {
      params: {
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
      },
    });
    requestBody = new Uint8Array(compressed);
    headers["Content-Encoding"] = "br";
  } else {
    requestBody = jsonBody;
  }

  return fetch(`${deploymentUrl}${endpoint}`, {
    method: "POST",
    headers,
    body: requestBody as BodyInit,
  });
}

/**
 * Load the pre-built Convex push bundle.
 *
 * This JSON is generated at build time by scripts/prebundle-convex.mjs.
 * The static import ensures Next.js includes it in the serverless function bundle.
 */
function loadPushBundle(): PushBundle {
  return convexPushBundle as unknown as PushBundle;
}

/**
 * Deploy the Convex schema and functions to a tenant's deployment
 * using the Convex HTTP push API (no CLI required).
 */
export async function deployConvexSchema(
  deployKey: string,
  deploymentUrl: string
): Promise<DeployResult> {
  try {
    // 1. Load the pre-built bundle
    const bundle = await loadPushBundle();

    // 2. Construct the push request with the tenant's deploy key
    const startPushRequest = {
      adminKey: deployKey,
      dryRun: false,
      functions: bundle.functions,
      appDefinition: bundle.appDefinition,
      componentDefinitions: bundle.componentDefinitions,
      nodeDependencies: bundle.nodeDependencies,
    };

    // 3. Start the push (upload functions)
    const startResponse = await convexFetch(
      deploymentUrl,
      deployKey,
      "/api/deploy2/start_push",
      startPushRequest,
      { compress: true }
    );

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      return {
        success: false,
        error: `Push failed (${startResponse.status}): ${errorText}`,
        schemaVersion: 0,
      };
    }

    const startPushResult = await startResponse.json();

    // 4. Wait for schema validation
    const schemaResult = await waitForSchema(
      deploymentUrl,
      deployKey,
      startPushResult
    );
    if (!schemaResult.success) {
      return { success: false, error: schemaResult.error, schemaVersion: 0 };
    }

    // 5. Finish the push
    const finishResponse = await convexFetch(
      deploymentUrl,
      deployKey,
      "/api/deploy2/finish_push",
      {
        adminKey: deployKey,
        startPush: startPushResult,
        dryRun: false,
      },
      { compress: true }
    );

    if (!finishResponse.ok) {
      const errorText = await finishResponse.text();
      return {
        success: false,
        error: `Finish push failed (${finishResponse.status}): ${errorText}`,
        schemaVersion: 0,
      };
    }

    return { success: true, schemaVersion: CURRENT_SCHEMA_VERSION };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown deployment error";
    return { success: false, error: message, schemaVersion: 0 };
  }
}

/**
 * Poll the Convex API until schema validation completes.
 */
async function waitForSchema(
  deploymentUrl: string,
  adminKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startPushResult: any
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_SCHEMA_WAIT_MS) {
    const response = await convexFetch(
      deploymentUrl,
      adminKey,
      "/api/deploy2/wait_for_schema",
      {
        adminKey,
        schemaChange: startPushResult.schemaChange,
        timeoutMs: SCHEMA_POLL_TIMEOUT_MS,
        dryRun: false,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Schema validation request failed (${response.status}): ${errorText}`,
      };
    }

    const status = await response.json();

    switch (status.type) {
      case "complete":
        return { success: true };
      case "failed":
        return {
          success: false,
          error: `Schema validation failed: ${status.error}`,
        };
      case "raceDetected":
        return {
          success: false,
          error: "Schema was overwritten by another push",
        };
      case "inProgress":
        // Continue polling
        break;
      default:
        return {
          success: false,
          error: `Unknown schema status: ${JSON.stringify(status)}`,
        };
    }
  }

  return { success: false, error: "Schema validation timed out" };
}

export async function validateConvexCredentials(
  deploymentUrl: string,
  deployKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`${deploymentUrl}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${deployKey}`,
      },
      body: JSON.stringify({
        path: "nonexistent:query",
        args: {},
        format: "json",
      }),
    });

    // 400 (function not found) = credentials valid
    // 401/403 = credentials invalid
    return response.status !== 401 && response.status !== 403;
  } catch {
    return false;
  }
}

export async function syncTenantConfig(
  deploymentUrl: string,
  deployKey: string,
  configs: Record<string, string>
): Promise<boolean> {
  try {
    for (const [key, value] of Object.entries(configs)) {
      const response = await fetch(`${deploymentUrl}/api/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
        body: JSON.stringify({
          path: "config:upsertConfig",
          args: { key, value },
          format: "json",
        }),
      });

      if (!response.ok) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export { CURRENT_SCHEMA_VERSION };
