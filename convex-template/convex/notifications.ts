import { v } from "convex/values";
import { mutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { recipientsForOutlet } from "./pushRecipients";
import { requireAccess } from "./auth";

// Register a push token for a user (replaces any existing tokens for that user)
export const registerPushToken = mutation({
  args: {
    userId: v.string(),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    // Optional so an older app build, which does not send it, still registers.
    // Such a device is treated as store-wide — see `pushRecipients.ts`.
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    // Remove existing tokens for this user
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    // Insert new token
    const id = await ctx.db.insert("pushTokens", {
      userId: args.userId,
      token: args.token,
      platform: args.platform,
      outletId: args.outletId,
    });

    return id;
  },
});

// Remove all push tokens for a user
export const removePushToken = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "write");
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
  },
});

// Internal query to get all push tokens (needed because internalAction cannot query DB directly)
export const getAllTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pushTokens").collect();
  },
});

/** How long to wait before asking Expo what the push provider did with a send. */
const RECEIPT_DELAY_MS = 2000;

interface ExpoOutcome {
  status?: unknown;
  id?: unknown;
  message?: unknown;
  details?: { error?: unknown };
}

function asOutcome(value: unknown): ExpoOutcome | null {
  return typeof value === "object" && value !== null ? (value as ExpoOutcome) : null;
}

function outcomeError(outcome: ExpoOutcome): string {
  const code = outcome.details?.error;
  if (typeof code === "string") return code;
  return typeof outcome.message === "string" ? outcome.message : "unknown";
}

/** The receipt ids worth chasing, and the devices Expo refused outright. */
function summarizeTickets(tickets: readonly unknown[]): {
  receiptIds: string[];
  failures: string[];
} {
  const receiptIds: string[] = [];
  const failures: string[] = [];
  for (const ticket of tickets) {
    const outcome = asOutcome(ticket);
    if (!outcome) {
      failures.push("unreadable");
      continue;
    }
    if (outcome.status === "ok" && typeof outcome.id === "string") {
      receiptIds.push(outcome.id);
      continue;
    }
    failures.push(outcomeError(outcome));
  }
  return { receiptIds, failures };
}

/** The causes in a `getReceipts` body; receipts still pending are ignored. */
function failedReceipts(body: unknown): string[] {
  const map = asOutcome(body) as Record<string, unknown> | null;
  if (!map) return [];
  const failures: string[] = [];
  for (const value of Object.values(map)) {
    const outcome = asOutcome(value);
    if (!outcome || outcome.status === "ok") continue;
    failures.push(outcomeError(outcome));
  }
  return failures;
}

/** "MismatchSenderId 12, DeviceNotRegistered 1" — one line per send. */
function describeFailures(failures: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const failure of failures) {
    counts.set(failure, (counts.get(failure) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([error, count]) => `${error} ${count}`)
    .join(", ");
}

// Send push notification to all registered devices
export const sendOrderNotification = internalAction({
  args: {
    customerName: v.string(),
    total: v.number(),
    itemCount: v.number(),
    orderId: v.string(),
    // The branch the order was placed at, when it has one. Absent rings every
    // device, which is what a single-location store needs.
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allTokens = await ctx.runQuery(internal.notifications.getAllTokens, {});

    // Ring only the branch that has to act on this order. A device cannot undo
    // a notification it already received, so this is the only place the
    // narrowing can happen.
    const tokens = recipientsForOutlet(allTokens, args.outletId);

    if (tokens.length === 0) {
      return;
    }

    const messages = tokens.map((doc) => ({
      to: doc.token,
      sound: "default" as const,
      // Route Android notifications to the high-importance "orders" channel so
      // they ring with the custom ringtone. Without this, Android delivers them
      // on the default channel and the ringtone never plays. Ignored on iOS.
      channelId: "orders",
      // FCM high priority. Android may hold a normal-priority message until
      // the device next leaves Doze, which on a counter phone face-down beside
      // the register is exactly when nobody sees the order.
      priority: "high" as const,
      title: "New Order!",
      body: `${args.customerName} — ₱${args.total.toFixed(2)} (${args.itemCount} item${args.itemCount !== 1 ? "s" : ""})`,
      data: { orderId: args.orderId },
    }));

    // Expo answers 200 while refusing every device, so the reply is READ, not
    // assumed. A ticket carries what Expo itself refuses (a dead device,
    // missing FCM credentials); the receipt, fetched a moment later, carries
    // what the push provider said — and `MismatchSenderId`, which silently
    // drops every Android notification for a whole app, appears ONLY there.
    // Logging both is what turns a platform-wide outage into one visible line
    // in this deployment's logs instead of months of silence.
    let tickets: unknown[] = [];
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });
      if (!response.ok) {
        console.error(`Expo push send responded ${response.status}`);
        return;
      }
      const body = (await response.json()) as { data?: unknown };
      tickets = Array.isArray(body.data) ? body.data : [];
    } catch (error) {
      console.error("Failed to send push notification:", error);
      return;
    }

    const summary = summarizeTickets(tickets);
    if (summary.failures.length > 0) {
      console.error("Push tickets refused:", describeFailures(summary.failures));
    }
    if (summary.receiptIds.length === 0) return;

    try {
      // Receipts settle a beat after the send; one short wait catches a
      // platform-wide refusal without holding the action open for long.
      await new Promise((resolve) => setTimeout(resolve, RECEIPT_DELAY_MS));
      const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ids: summary.receiptIds }),
      });
      if (!response.ok) {
        console.error(`Expo receipt lookup responded ${response.status}`);
        return;
      }
      const body = (await response.json()) as { data?: unknown };
      const failures = failedReceipts(body.data);
      if (failures.length > 0) {
        console.error("Push receipts refused:", describeFailures(failures));
      }
    } catch (error) {
      console.error("Failed to read push receipts:", error);
    }
  },
});
