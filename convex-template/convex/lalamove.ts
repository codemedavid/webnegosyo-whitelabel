import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";

export const bookLalamove = action({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(api.orders.getOrderById, {
      orderId: args.orderId,
    });

    if (!order || !order.lalamoveQuotationId || !order.deliveryAddress) {
      return { success: false, error: "Order missing delivery details" };
    }

    const configs = await ctx.runQuery(internal.config.getConfigs, {
      keys: [
        "lalamove_api_key",
        "lalamove_secret_key",
        "lalamove_market",
        "lalamove_service_type",
        "lalamove_sandbox",
        "restaurant_address",
        "restaurant_latitude",
        "restaurant_longitude",
      ],
    });

    const configMap = new Map(configs.map((c: { key: string; value: string }) => [c.key, c.value]));
    const apiKey = configMap.get("lalamove_api_key");
    const secretKey = configMap.get("lalamove_secret_key");

    if (!apiKey || !secretKey) {
      return { success: false, error: "Lalamove not configured" };
    }

    const isSandbox = configMap.get("lalamove_sandbox") === "true";
    const baseUrl = isSandbox
      ? "https://rest.sandbox.lalamove.com"
      : "https://rest.lalamove.com";

    try {
      const response = await fetch(`${baseUrl}/v3/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `hmac ${apiKey}:${Date.now()}:${secretKey}`,
          Market: configMap.get("lalamove_market") ?? "PH",
        },
        body: JSON.stringify({
          quotationId: order.lalamoveQuotationId,
          sender: {
            stopId: "stop1",
            name: configMap.get("restaurant_address") ?? "Restaurant",
            phone: "+639000000000",
          },
          recipients: [
            {
              stopId: "stop2",
              name: order.customerName,
              phone: order.customerContact,
            },
          ],
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await ctx.runMutation(internal.orders.updateLalamoveDetailsInternal, {
          orderId: args.orderId,
          lalamoveOrderId: data.orderId,
          lalamoveStatus: "ASSIGNING_DRIVER",
          lalamoveTrackingUrl: data.shareLink ?? "",
        });

        return { success: true, lalamoveOrderId: data.orderId };
      } else {
        return { success: false, error: data.message ?? "Lalamove API error" };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  },
});
