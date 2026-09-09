import { v } from "convex/values";
import { isE164Phone, normalizeLalamovePhone, resolveLalamoveRecipient } from "./lalamoveContact";
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
  pickupAddress: string;
  pickupLatitude: string;
  pickupLongitude: string;
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
  "restaurant_address",
  "restaurant_latitude",
  "restaurant_longitude",
];

/** Mirrors getLanguageForMarket in src/lib/lalamove-service.ts. */
const MARKET_LANGUAGES: Record<string, string> = {
  HK: "en_HK",
  SG: "en_SG",
  TH: "th_TH",
  PH: "en_PH",
  TW: "zh_TW",
  MY: "ms_MY",
  VN: "vi_VN",
};

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
      // Lalamove's `message` is a code ("ERR_INVALID_FIELD"); `detail` is the
      // sentence a merchant can act on ("'' is not valid 'phone'…").
      const first = json?.errors?.[0];
      const message =
        [first?.message, first?.detail].filter(Boolean).join(": ") ||
        json?.message ||
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
    senderPhone: normalizeLalamovePhone(map.get("lalamove_sender_phone") as string | undefined, market),
    pickupAddress: (map.get("restaurant_address") as string) ?? "",
    pickupLatitude: (map.get("restaurant_latitude") as string) ?? "",
    pickupLongitude: (map.get("restaurant_longitude") as string) ?? "",
  };
}

/** A usable coordinate string: parses to a finite, non-zero number. The web
 * app syncs "0" when the pin was never set, so zero means "missing". */
function isUsableCoordinate(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) && parsed !== 0;
}

/**
 * Book a Lalamove delivery for an order that already has a quotation.
 * Retrieves the quotation to get the real stop IDs, then places the order with
 * the store as sender and the customer as recipient.
 */
export const bookLalamove = action({
  args: { orderId: v.id("orders") },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    error?: string;
    lalamoveOrderId?: string;
    /** "store" when the rider will call the store because the customer left
     * no phone — the app tells the merchant so. */
    recipientPhoneSource?: "customer" | "store";
  }> => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });

    if (!order) {
      return { success: false, error: "Order not found" };
    }
    // Distinct reasons: the app offers "Get New Quote" on a quotation
    // problem, and a missing address is something only the customer can fix.
    if (!order.lalamoveQuotationId || String(order.lalamoveQuotationId).trim() === "") {
      return {
        success: false,
        error: "This order has no Lalamove quotation yet — get a new quote first",
      };
    }
    if (!order.deliveryAddress) {
      return { success: false, error: "This order has no delivery address" };
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
    // Lalamove refuses anything but bare E.164, naming no number when it
    // does. Say which one here, before a rider is even asked for.
    if (!isE164Phone(config.senderPhone)) {
      return {
        success: false,
        error: `Your store pickup phone (${config.senderPhone}) is not a valid mobile number. Fix it in delivery settings.`,
      };
    }

    // The customer's phone wherever the checkout form put it; failing that
    // the store's own, so an order from a form with no phone field is still
    // bookable. customerContact used to be forwarded verbatim — '' on such a
    // form — and Lalamove refused it ("'' is not valid 'phone'").
    const recipient = resolveLalamoveRecipient(
      order.customerContact,
      order.customerData,
      config.market,
      config.senderPhone
    );
    if (!recipient.phone) {
      return {
        success: false,
        error: "No phone number to give the rider. Add a store pickup phone in delivery settings.",
      };
    }

    // Retrieve the quotation to obtain the real stop IDs (sender + recipient).
    const quotation = await callLalamove(
      config,
      "GET",
      `/v3/quotations/${order.lalamoveQuotationId}`
    );
    if (!quotation.ok) {
      // Quotations die ~5 minutes after checkout. Whatever Lalamove said, the
      // merchant's next move is the same — and the app's alert offers it.
      return {
        success: false,
        error: `Quotation expired or no longer valid (${quotation.error ?? quotation.status}) — get a new quote`,
      };
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
          phone: recipient.phone,
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

    return {
      success: true,
      lalamoveOrderId: placed.data.orderId,
      recipientPhoneSource: recipient.source === "store" ? "store" : "customer",
    };
  },
});

/**
 * Replace an expired quotation with a fresh one so the order can be booked.
 *
 * Quotations expire ~5 minutes after checkout; a merchant confirming later
 * than that used to be stuck with an unbookable order. The new quote runs
 * store pin → the order's stored delivery coordinates. The customer's
 * deliveryFee is deliberately NOT changed — the price was agreed at checkout.
 */
export const requoteLalamove = action({
  args: { orderId: v.id("orders") },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; error?: string; quotationId?: string; price?: string }> => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });
    if (!order) {
      return { success: false, error: "Order not found" };
    }
    if (order.lalamoveOrderId && String(order.lalamoveOrderId).trim() !== "") {
      return {
        success: false,
        error: "A delivery is already booked for this order — cancel it before re-quoting",
      };
    }
    if (
      !order.deliveryAddress ||
      order.deliveryLatitude === undefined ||
      order.deliveryLongitude === undefined
    ) {
      return { success: false, error: "This order has no delivery coordinates to quote against" };
    }

    const config = await loadConfig(ctx);
    if (!config) {
      return { success: false, error: "Lalamove not configured" };
    }
    if (
      !config.pickupAddress ||
      !isUsableCoordinate(config.pickupLatitude) ||
      !isUsableCoordinate(config.pickupLongitude)
    ) {
      return {
        success: false,
        error: "Your store pickup address and map pin are not set. Add them in delivery settings.",
      };
    }

    const quote = await callLalamove(config, "POST", "/v3/quotations", {
      serviceType: config.serviceType,
      language: MARKET_LANGUAGES[config.market.toUpperCase()] ?? "en_US",
      stops: [
        {
          coordinates: { lat: config.pickupLatitude, lng: config.pickupLongitude },
          address: config.pickupAddress,
        },
        {
          coordinates: {
            lat: String(order.deliveryLatitude),
            lng: String(order.deliveryLongitude),
          },
          address: order.deliveryAddress,
        },
      ],
    });
    if (!quote.ok) {
      return { success: false, error: quote.error ?? "Failed to create quotation" };
    }

    await ctx.runMutation(internal.orders.updateLalamoveDetailsInternal, {
      orderId: args.orderId,
      lalamoveQuotationId: quote.data.quotationId,
    });

    return {
      success: true,
      quotationId: quote.data.quotationId,
      price: quote.data.priceBreakdown?.total,
    };
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
