# Real-Time Convex Order Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route website orders to Convex (when configured), with real-time updates, sound alerts, and Expo push notifications in the mobile admin app.

**Architecture:** Website checkout writes to Convex only when tenant has Convex configured. Convex `createOrder` mutation schedules an internal action to send Expo push notifications. Mobile admin app leverages Convex query reactivity for live updates, plus a client-side hook that detects new orders and plays a sound/shows an alert. Push tokens are stored in a Convex `pushTokens` table.

**Tech Stack:** Convex (mutations, actions, internal functions), Expo Notifications, Expo Audio, React Native

---

### Task 1: Add `pushTokens` table to Convex schema

**Files:**
- Modify: `convex-template/convex/schema.ts`

**Step 1: Add the pushTokens table definition**

Add after the `tenantConfig` table in `schema.ts`:

```typescript
pushTokens: defineTable({
  userId: v.string(),
  token: v.string(),
  platform: v.union(v.literal("ios"), v.literal("android")),
})
  .index("by_user", ["userId"]),
```

**Step 2: Verify schema is valid**

Run: `cd convex-template && npx convex dev --once 2>&1 | head -20` (if Convex CLI is available locally) or just verify TypeScript compiles.

**Step 3: Commit**

```bash
git add convex-template/convex/schema.ts
git commit -m "feat: add pushTokens table to Convex schema"
```

---

### Task 2: Create Convex notifications module

**Files:**
- Create: `convex-template/convex/notifications.ts`

**Step 1: Create the notifications module with push token CRUD and send action**

Create `convex-template/convex/notifications.ts`:

```typescript
import { v } from "convex/values";
import { mutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// --- Push Token Management ---

export const registerPushToken = mutation({
  args: {
    userId: v.string(),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    // Remove existing tokens for this user (one device per user)
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    await ctx.db.insert("pushTokens", {
      userId: args.userId,
      token: args.token,
      platform: args.platform,
    });
  },
});

export const removePushToken = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const doc of tokens) {
      await ctx.db.delete(doc._id);
    }
  },
});

// --- Internal: Send Push Notification ---

export const sendOrderNotification = internalAction({
  args: {
    customerName: v.string(),
    total: v.number(),
    itemCount: v.number(),
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all push tokens (all admins for this tenant's Convex deployment)
    const tokens = await ctx.runQuery(internal.notifications.getAllTokens, {});

    if (tokens.length === 0) return;

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: "default",
      title: "New Order!",
      body: `${args.customerName} — ₱${args.total.toFixed(2)} (${args.itemCount} item${args.itemCount !== 1 ? "s" : ""})`,
      data: { orderId: args.orderId },
    }));

    // Expo Push API — batch send
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });
    } catch (e) {
      console.error("Failed to send push notification:", e);
    }
  },
});




export const getAllTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pushTokens").collect();
  },
});
```

**Step 2: Commit**

```bash
git add convex-template/convex/notifications.ts
git commit -m "feat: add Convex notifications module with push token CRUD and Expo push"
```

---

### Task 3: Wire `createOrder` to trigger push notification

**Files:**
- Modify: `convex-template/convex/orders.ts`

**Step 1: Import the internal API and scheduler**

At the top of `convex-template/convex/orders.ts`, add:

```typescript
import { internal } from "./_generated/api";
```

**Step 2: Schedule notification after order insert**

In the `createOrder` mutation handler, after the `return orderId;` line (but before the return), add the scheduler call. The handler should become:

```typescript
handler: async (ctx, args) => {
  const { items, ...orderData } = args;

  const orderId = await ctx.db.insert("orders", {
    ...orderData,
    status: "pending",
    paymentStatus: "pending",
  });

  for (const item of items) {
    await ctx.db.insert("orderItems", {
      orderId,
      ...item,
    });
  }

  // Send push notification to admin devices
  await ctx.scheduler.runAfter(0, internal.notifications.sendOrderNotification, {
    customerName: args.customerName,
    total: args.total,
    itemCount: args.itemCount,
    orderId: orderId,
  });

  return orderId;
},
```

**Step 3: Commit**

```bash
git add convex-template/convex/orders.ts
git commit -m "feat: trigger push notification on new order creation"
```

---

### Task 4: Install Expo packages in mobile admin app

**Files:**
- Modify: `webnegosyo-app/package.json`

**Step 1: Install expo-notifications and expo-device**

```bash
cd webnegosyo-app && npx expo install expo-notifications expo-device expo-av
```

`expo-notifications` handles push token registration and notification display.
`expo-device` detects physical device (push only works on real devices, not simulators).
`expo-av` handles notification sound playback.

**Step 2: Commit**

```bash
git add webnegosyo-app/package.json webnegosyo-app/package-lock.json
git commit -m "feat: install expo-notifications, expo-device, expo-av"
```

---

### Task 5: Create notification utilities in mobile app

**Files:**
- Create: `webnegosyo-app/lib/notifications.ts`

**Step 1: Create the notifications utility**

```typescript
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "New Orders",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    });
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}
```

**Step 2: Commit**

```bash
git add webnegosyo-app/lib/notifications.ts
git commit -m "feat: add push notification registration utility"
```

---

### Task 6: Create order alerts hook for in-app sound + banner

**Files:**
- Create: `webnegosyo-app/hooks/useOrderAlerts.ts`

**Step 1: Create the hook**

This hook detects when new orders appear via Convex reactivity and plays a sound + shows an in-app alert.

```typescript
import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { Audio } from "expo-av";

interface OrderAlertOptions {
  orders: Array<{ _id: string; customerName: string; total: number; itemCount: number }> | undefined;
  enabled?: boolean;
}

export function useOrderAlerts({ orders, enabled = true }: OrderAlertOptions) {
  const prevCountRef = useRef<number | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup sound on unmount
      soundRef.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !orders) return;

    const currentCount = orders.length;
    const currentIds = new Set(orders.map((o) => o._id));

    // Skip first render (initial load)
    if (prevCountRef.current === null) {
      prevCountRef.current = currentCount;
      prevIdsRef.current = currentIds;
      return;
    }

    // Find genuinely new orders (IDs we haven't seen)
    const newOrders = orders.filter((o) => !prevIdsRef.current.has(o._id));

    if (newOrders.length > 0) {
      // Play notification sound
      playAlertSound();

      // Show in-app alert for the most recent new order
      const latest = newOrders[0];
      Alert.alert(
        "New Order!",
        `${latest.customerName} — ₱${latest.total.toFixed(2)} (${latest.itemCount} item${latest.itemCount !== 1 ? "s" : ""})`,
        [{ text: "OK" }]
      );
    }

    prevCountRef.current = currentCount;
    prevIdsRef.current = currentIds;
  }, [orders, enabled]);
}

async function playAlertSound() {
  try {
    const { sound } = await Audio.Sound.createAsync(
      // Use a simple system-like notification sound
      // Generates a short beep via a data URI
      { uri: Platform.select({
        ios: "https://cdn.pixabay.com/audio/2024/11/27/audio_c777bdd828.mp3",
        default: "https://cdn.pixabay.com/audio/2024/11/27/audio_c777bdd828.mp3",
      }) as string },
      { shouldPlay: true, volume: 1.0 }
    );

    // Unload after playing
    sound.setOnPlaybackStatusUpdate((status) => {
      if ("didJustFinish" in status && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (e) {
    console.warn("Failed to play alert sound:", e);
  }
}
```

**Step 2: Commit**

```bash
git add webnegosyo-app/hooks/useOrderAlerts.ts
git commit -m "feat: add useOrderAlerts hook for in-app sound and alert"
```

---

### Task 7: Register push token on login and integrate alerts

**Files:**
- Modify: `webnegosyo-app/app/_layout.tsx`
- Modify: `webnegosyo-app/app/(main)/dashboard.tsx`
- Modify: `webnegosyo-app/app/(main)/orders.tsx`

**Step 1: Register push token in `_layout.tsx` AuthGate**

In `webnegosyo-app/app/_layout.tsx`, after the `setAuth(...)` call where authentication succeeds (the block that sets `isAuthenticated: true`), add push token registration:

Add these imports at the top:
```typescript
import { registerForPushNotifications } from "../lib/notifications";
import { useSafeMutation } from "../lib/hooks";
import { FunctionReference } from "convex/server";
```

Inside the `AuthGate` component, add a `useEffect` that registers the push token when authenticated + convexUrl is available:

```typescript
const registerTokenRef = "notifications:registerPushToken" as unknown as FunctionReference<"mutation">;

// After the existing navigation useEffect, add:
useEffect(() => {
  if (!isAuthenticated || !convexUrl) return;

  const userId = useAuthStore.getState().userId;
  if (!userId) return;

  registerForPushNotifications().then(async (token) => {
    if (!token) return;
    try {
      const convex = require("convex/react");
      // Use HTTP client for one-off mutation since we're outside ConvexProvider render tree
      const response = await fetch(`${convexUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "notifications:registerPushToken",
          args: {
            userId,
            token,
            platform: require("react-native").Platform.OS === "ios" ? "ios" : "android",
          },
          format: "json",
        }),
      });
    } catch (e) {
      console.warn("Failed to register push token:", e);
    }
  });
}, [isAuthenticated, convexUrl]);
```

**Step 2: Integrate `useOrderAlerts` in dashboard**

In `webnegosyo-app/app/(main)/dashboard.tsx`:

Add import:
```typescript
import { useOrderAlerts } from "../../hooks/useOrderAlerts";
```

After the existing `useSafeQuery` calls, add:
```typescript
const pendingOrders = queue?.data?.pending;
useOrderAlerts({ orders: pendingOrders, enabled: !!convexUrl });
```

**Step 3: Integrate `useOrderAlerts` in orders screen**

In `webnegosyo-app/app/(main)/orders.tsx`:

Add import:
```typescript
import { useOrderAlerts } from "../../hooks/useOrderAlerts";
```

After the existing `useSafeQuery` call, add:
```typescript
useOrderAlerts({ orders: orders?.data, enabled: filter === "all" || filter === "pending" });
```

Note: Only alert when viewing "all" or "pending" filters to avoid duplicate alerts.

**Step 4: Commit**

```bash
git add webnegosyo-app/app/_layout.tsx webnegosyo-app/app/(main)/dashboard.tsx webnegosyo-app/app/(main)/orders.tsx
git commit -m "feat: register push token on login, integrate order alerts on dashboard and orders"
```

---

### Task 8: Verify and fix the Convex-only order path

**Files:**
- Modify: `src/app/actions/orders.ts` (verify existing logic)
- Modify: `src/lib/orders-service.ts` (verify `createOrderConvex`)

**Step 1: Verify `createOrderAction` routes to Convex only**

Read `src/app/actions/orders.ts:57-133`. The existing logic already checks for `convex_deployment_url` and `convex_deploy_key` and routes to `createOrderConvex()` when both exist. This returns `{ order: { id: orderId }, orderToken: undefined }`.

**Verify:** The Supabase path is only hit when Convex is NOT configured. This is already correct — no changes needed if the code matches the exploration.

**Step 2: Verify checkout page handles missing orderToken**

The checkout page at `src/app/[tenant]/checkout/page.tsx` uses `orderToken` for the Messenger public API. Since Convex path returns `orderToken: undefined`, ensure the Messenger flow handles this gracefully (skips token-based verification).

Read the checkout page around lines 332-429 to verify it checks `orderToken` before using it.

**Step 3: Commit (only if changes were needed)**

```bash
git add src/app/actions/orders.ts src/lib/orders-service.ts
git commit -m "fix: ensure Convex-only path for configured tenants"
```

---

### Task 9: Deploy updated Convex schema and test end-to-end

**Step 1: Deploy the updated Convex schema**

The Convex schema now has a new `pushTokens` table and the `createOrder` mutation triggers a notification action. This needs to be deployed to the tenant's Convex instance.

Go to superadmin panel → tenant settings → click "Deploy Schema to Convex" for the tenant (Cafe Juancho).

Or run manually:
```bash
cd convex-template && CONVEX_DEPLOY_KEY="<key>" npx convex deploy --cmd 'echo deployed'
```

**Step 2: Test the flow**

1. Open the mobile admin app → dashboard should show (with zeros if empty)
2. On the website, place a test order for the Convex-enabled tenant
3. Mobile admin app should:
   - Auto-update the dashboard stats and order queue (Convex reactivity)
   - Play a notification sound
   - Show an in-app alert with order details
4. If the app is backgrounded, a push notification should appear

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete real-time Convex order management with push notifications"
```
