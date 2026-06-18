import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";

/**
 * Lalamove v3 REST integration (per-tenant Convex deployment).
 *
 * Credentials live in tenantConfig (synced from the web app on deploy). The web
 * app also has an SDK-based path (src/lib/lalamove-service.ts); this module is
 * the equivalent for clients that only talk to Convex — notably the merchant
 * admin mobile app (webnegosyo-app).
 *
 * v3 auth uses an HMAC-SHA256 signature, NOT the raw secret. The signature is
 * computed over `{timestamp}\r\n{METHOD}\r\n{path}\r\n\r\n{body}` and sent as
 * `Authorization: hmac {apiKey}:{timestamp}:{signature}`. Request/response
 * payloads are wrapped in a `{ data: ... }` envelope.
 */

interface LalamoveConfig {
  apiKey: string;
  secretKey: string;
  market: string;
  serviceType: string;
  isSandbox: boolean;
  senderName: string;
  senderPhone: string;
}

interface LalamoveResponse {
  ok: boolean;
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error?: string;
}

const CONFIG_KEYS = [
  "lalamove_api_key",
  "lalamove_secret_key",
  "lalamove_market",
  "lalamove_service_type",
  "lalamove_sandbox",
  "lalamove_sender_phone",
  "restaurant_name",
];

/**
 * Normalize a phone to E.164. PH is the primary market; other markets fall
 * back to a generic "+digits" form. Mirrors src/lib/lalamove-phone.ts.
 */
function normalizePhone(phone: string | undefined, market: string): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (market.toUpperCase() === "PH") {
    if (digits.startsWith("63")) return `+${digits}`;
    if (digits.startsWith("0")) return `+63${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith("9")) return `+63${digits}`;
    return `+63${digits}`;
  }
  return `+${digits}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the Lalamove v3 HMAC-SHA256 signature for a request.
 */
async function signRequest(
  secretKey: string,
  timestamp: string,
  method: string,
  path: string,
  body: string
): Promise<string> {
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawSignature)
  );
  return toHex(signature);
}

/**
 * Make a signed call to the Lalamove v3 REST API.
 */
async function callLalamove(
  config: LalamoveConfig,
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
): Promise<LalamoveResponse> {
  const baseUrl = config.isSandbox
    ? "https://rest.sandbox.lalamove.com"
    : "https://rest.lalamove.com";

  const body = data !== undefined ? JSON.stringify({ data }) : "";
  const timestamp = Date.now().toString();
  const signature = await signRequest(
    config.secretKey,
    timestamp,
    method,
    path,
    body
  );

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `hmac ${config.apiKey}:${timestamp}:${signature}`,
        Market: config.market,
      },
      ...(body ? { body } : {}),
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message =
        json?.message ||
        json?.errors?.[0]?.message ||
        `Lalamove API error (${response.status})`;
      return { ok: false, status: response.status, data: json, error: message };
    }

    return { ok: true, status: response.status, data: json.data ?? json };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Network error";
    return { ok: false, status: 0, data: null, error: message };
  }
}

/**
 * Load Lalamove config from tenantConfig, returning null when not configured.
 */
async function loadConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any
): Promise<LalamoveConfig | null> {
  const configs = await ctx.runQuery(internal.config.getConfigs, {
    keys: CONFIG_KEYS,
  });
  const map = new Map(
    configs.map((c: { key: string; value: string }) => [c.key, c.value])
  );

  const apiKey = map.get("lalamove_api_key");
  const secretKey = map.get("lalamove_secret_key");
  if (!apiKey || !secretKey) return null;

  const market = (map.get("lalamove_market") as string) ?? "PH";
  return {
    apiKey: apiKey as string,
    secretKey: secretKey as string,
    market,
    serviceType: (map.get("lalamove_service_type") as string) ?? "MOTORCYCLE",
    isSandbox: map.get("lalamove_sandbox") === "true",
    senderName: (map.get("restaurant_name") as string) ?? "Restaurant",
    senderPhone: normalizePhone(map.get("lalamove_sender_phone") as string, market),
  };
}

/**
 * Book a Lalamove delivery for an order that already has a quotation.
 * Retrieves the quotation to get the real stop IDs, then places the order with
 * the store as sender and the customer as recipient.
 */
export const bookLalamove = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; lalamoveOrderId?: string }> => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });

    if (!order || !order.lalamoveQuotationId || !order.deliveryAddress) {
      return { success: false, error: "Order missing delivery details" };
    }

    if (order.lalamoveOrderId && String(order.lalamoveOrderId).trim() !== "") {
      return { success: false, error: "Lalamove order already exists" };
    }

    const config = await loadConfig(ctx);
    if (!config) {
      return { success: false, error: "Lalamove not configured" };
    }

    if (!config.senderPhone) {
      return {
        success: false,
        error: "Store pickup phone is not set. Add it in delivery settings.",
      };
    }

    // Retrieve the quotation to obtain the real stop IDs (sender + recipient).
    const quotation = await callLalamove(
      config,
      "GET",
      `/v3/quotations/${order.lalamoveQuotationId}`
    );
    if (!quotation.ok) {
      return { success: false, error: quotation.error ?? "Quotation expired" };
    }

    const stops = quotation.data?.stops ?? [];
    if (stops.length < 2) {
      return { success: false, error: "Quotation has no valid stops" };
    }

    const placed = await callLalamove(config, "POST", "/v3/orders", {
      quotationId: order.lalamoveQuotationId,
      sender: {
        stopId: stops[0].stopId,
        name: config.senderName,
        phone: config.senderPhone,
      },
      recipients: [
        {
          stopId: stops[stops.length - 1].stopId,
          name: order.customerName,
          phone: normalizePhone(order.customerContact, config.market),
          remarks: order.deliveryAddress,
        },
      ],
      isPODEnabled: true,
      metadata: { orderId: String(args.orderId) },
    });

    if (!placed.ok) {
      return { success: false, error: placed.error ?? "Lalamove API error" };
    }

    await ctx.runMutation(internal.orders.updateLalamoveDetailsInternal, {
      orderId: args.orderId,
      lalamoveOrderId: placed.data.orderId,
      lalamoveStatus: placed.data.status ?? "ASSIGNING_DRIVER",
      lalamoveTrackingUrl: placed.data.shareLink ?? "",
    });

    return { success: true, lalamoveOrderId: placed.data.orderId };
  },
});

/**
 * Cancel a Lalamove delivery.
 */
export const cancelLalamove = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!order?.lalamoveOrderId) {
      return { success: false, error: "No Lalamove order to cancel" };
    }

    const config = await loadConfig(ctx);
    if (!config) return { success: false, error: "Lalamove not configured" };

    const result = await callLalamove(
      config,
      "DELETE",
      `/v3/orders/${order.lalamoveOrderId}`
    );
    if (!result.ok) {
      return { success: false, error: result.error ?? "Failed to cancel" };
    }

    await ctx.runMutation(internal.orders.updateLalamoveDetailsInternal, {
      orderId: args.orderId,
      lalamoveStatus: "CANCELLED",
    });

    return { success: true };
  },
});

/**
 * Add a priority fee (tip) to speed up driver matching.
 */
export const addLalamovePriorityFee = action({
  args: { orderId: v.id("orders"), amount: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!order?.lalamoveOrderId) {
      return { success: false, error: "No Lalamove order found" };
    }

    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "Invalid priority fee amount" };
    }

    const config = await loadConfig(ctx);
    if (!config) return { success: false, error: "Lalamove not configured" };

    const result = await callLalamove(
      config,
      "POST",
      `/v3/orders/${order.lalamoveOrderId}/priority-fee`,
      { priorityFee: String(amount) }
    );
    if (!result.ok) {
      return { success: false, error: result.error ?? "Failed to add priority fee" };
    }

    return { success: true };
  },
});

/**
 * Pull the latest Lalamove order + driver status and persist it.
 */
export const syncLalamoveStatus = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; status?: string }> => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!order?.lalamoveOrderId) {
      return { success: false, error: "No Lalamove order found" };
    }

    const config = await loadConfig(ctx);
    if (!config) return { success: false, error: "Lalamove not configured" };

    const result = await callLalamove(
      config,
      "GET",
      `/v3/orders/${order.lalamoveOrderId}`
    );
    if (!result.ok) {
      return { success: false, error: result.error ?? "Failed to sync" };
    }

    const updates: {
      orderId: typeof args.orderId;
      lalamoveStatus?: string;
      lalamoveTrackingUrl?: string;
      lalamoveDriverName?: string;
      lalamoveDriverPhone?: string;
    } = {
      orderId: args.orderId,
      lalamoveStatus: result.data.status,
      lalamoveTrackingUrl: result.data.shareLink ?? undefined,
    };

    // Fetch driver details once one is assigned.
    const driverId = result.data.driverId;
    if (driverId) {
      const driver = await callLalamove(
        config,
        "GET",
        `/v3/orders/${order.lalamoveOrderId}/drivers/${driverId}`
      );
      if (driver.ok) {
        updates.lalamoveDriverName = driver.data.name ?? undefined;
        updates.lalamoveDriverPhone = driver.data.phone ?? undefined;
      }
    }

    await ctx.runMutation(internal.orders.updateLalamoveDetailsInternal, updates);

    return { success: true, status: result.data.status };
  },
});
