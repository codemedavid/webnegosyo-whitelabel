# Convex Order Tracking & Queue System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Supabase as the order database for Convex-enabled tenants, build a shared Convex schema template that auto-deploys to tenant projects, add analytics event tracking, and build a React Native admin app (webnegosyo-app) with real-time order management and analytics dashboards.

**Architecture:** Each tenant with `app_enabled` gets their own Convex project. Supabase remains for auth, tenants, menu items, and config. Convex becomes the primary order/analytics database per tenant. A shared Convex schema template lives in the monorepo and gets pushed to tenant projects via CLI when credentials are saved. A new React Native admin app connects to the tenant's Convex for real-time data.

**Tech Stack:** Convex, Next.js 15, React Native (Expo SDK 54), Expo Router, Supabase Auth, TypeScript

**Design doc:** `docs/plans/2026-02-28-convex-order-tracking-design.md`

---

## Phase 1: Convex Schema Template & Infrastructure

### Task 1: Supabase Migration — Add Convex columns to tenants table

**Files:**
- Create: `supabase/migrations/20260228000001_add_convex_columns.sql`
- Modify: `src/types/database.ts` (add new columns to Tenants type)

**Step 1: Write the migration SQL**

```sql
-- Add Convex deployment columns to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS convex_deployment_url TEXT,
  ADD COLUMN IF NOT EXISTS convex_deploy_key TEXT,
  ADD COLUMN IF NOT EXISTS convex_schema_version INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN tenants.convex_deployment_url IS 'URL of the tenant Convex deployment (e.g. https://tenant.convex.cloud)';
COMMENT ON COLUMN tenants.convex_deploy_key IS 'Deploy key for pushing schema to the tenant Convex project';
COMMENT ON COLUMN tenants.convex_schema_version IS 'Current version of the Convex schema deployed to this tenant';
```

**Step 2: Apply the migration via Supabase MCP tool**

Run: `mcp__supabase__apply_migration` with name `add_convex_columns` and the SQL above.

**Step 3: Update database types**

In `src/types/database.ts`, add to the `tenants` Row/Insert/Update interfaces:
```typescript
convex_deployment_url: string | null
convex_deploy_key: string | null
convex_schema_version: number
```

**Step 4: Update tenants-service.ts Zod schema**

In `src/lib/tenants-service.ts`, add to `tenantSchema`:
```typescript
convex_deployment_url: z.string().url().nullable().optional(),
convex_deploy_key: z.string().nullable().optional(),
```

**Step 5: Commit**

```bash
git add supabase/migrations/20260228000001_add_convex_columns.sql src/types/database.ts src/lib/tenants-service.ts
git commit -m "feat: add convex deployment columns to tenants table"
```

---

### Task 2: Create Convex Schema Template

The shared Convex schema template lives in `convex-template/` at the project root. This is NOT a deployable Convex project — it's a template that gets copied and deployed to each tenant's project.

**Files:**
- Create: `convex-template/schema.ts`
- Create: `convex-template/auth.config.ts`

**Step 1: Create the schema file**

Create `convex-template/schema.ts`:
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  orders: defineTable({
    customerName: v.string(),
    customerContact: v.string(),
    customerData: v.optional(v.any()),
    total: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    orderType: v.optional(v.string()),
    orderTypeId: v.optional(v.string()),
    source: v.union(v.literal("web"), v.literal("mobile")),
    itemCount: v.number(),
    paymentMethod: v.optional(v.string()),
    paymentMethodDetails: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    deliveryLatitude: v.optional(v.number()),
    deliveryLongitude: v.optional(v.number()),
    lalamoveQuotationId: v.optional(v.string()),
    lalamoveOrderId: v.optional(v.string()),
    lalamoveStatus: v.optional(v.string()),
    lalamoveDriverName: v.optional(v.string()),
    lalamoveDriverPhone: v.optional(v.string()),
    lalamoveTrackingUrl: v.optional(v.string()),
    hasUpsellItems: v.optional(v.boolean()),
    hasBundleItems: v.optional(v.boolean()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["_creationTime"])
    .index("by_status_created", ["status", "_creationTime"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    menuItemId: v.string(),
    menuItemName: v.string(),
    quantity: v.number(),
    price: v.number(),
    subtotal: v.number(),
    specialInstructions: v.optional(v.string()),
    variation: v.optional(v.string()),
    variationSelections: v.optional(
      v.array(
        v.object({
          typeName: v.string(),
          optionName: v.string(),
          priceAdjustment: v.number(),
        })
      )
    ),
    addons: v.optional(
      v.array(
        v.object({
          name: v.string(),
          price: v.number(),
          quantity: v.optional(v.number()),
        })
      )
    ),
    isUpsellItem: v.optional(v.boolean()),
    isBundleItem: v.optional(v.boolean()),
    bundleId: v.optional(v.string()),
  }).index("by_order", ["orderId"]),

  analyticsEvents: defineTable({
    type: v.string(),
    metadata: v.optional(v.any()),
    sessionId: v.optional(v.string()),
  })
    .index("by_type", ["type"])
    .index("by_type_time", ["type", "_creationTime"]),

  dailyStats: defineTable({
    date: v.string(),
    totalOrders: v.number(),
    totalRevenue: v.number(),
    avgOrderValue: v.number(),
    upsellConversionRate: v.optional(v.number()),
    topItems: v.optional(
      v.array(
        v.object({
          itemId: v.string(),
          name: v.string(),
          count: v.number(),
          revenue: v.number(),
        })
      )
    ),
  }).index("by_date", ["date"]),

  tenantConfig: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
```

**Step 2: Create auth config for Supabase JWT verification**

Create `convex-template/auth.config.ts`:
```typescript
import { AuthConfig } from "convex/server";

// The SUPABASE_PROJECT_REF placeholder is replaced during deployment
// with the actual Supabase project ref from environment
const SUPABASE_ISSUER = process.env.SUPABASE_ISSUER ?? "https://YOUR_PROJECT.supabase.co/auth/v1";
const SUPABASE_JWKS = process.env.SUPABASE_JWKS ?? "https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json";

export default {
  providers: [
    {
      type: "customJwt",
      issuer: SUPABASE_ISSUER,
      jwks: SUPABASE_JWKS,
      algorithm: "ES256",
      applicationID: "authenticated",
    },
  ],
} satisfies AuthConfig;
```

**Step 3: Commit**

```bash
git add convex-template/
git commit -m "feat: create Convex schema template for tenant deployments"
```

---

### Task 3: Create Convex Functions Template

**Files:**
- Create: `convex-template/orders.ts` (mutations + queries)
- Create: `convex-template/analytics.ts` (event tracking + analytics queries)
- Create: `convex-template/lalamove.ts` (Lalamove auto-booking action)
- Create: `convex-template/crons.ts` (daily stats aggregation)
- Create: `convex-template/http.ts` (webhook endpoints)

**Step 1: Create orders.ts — mutations and queries**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// --- MUTATIONS ---

export const createOrder = mutation({
  args: {
    customerName: v.string(),
    customerContact: v.string(),
    customerData: v.optional(v.any()),
    total: v.number(),
    orderType: v.optional(v.string()),
    orderTypeId: v.optional(v.string()),
    source: v.union(v.literal("web"), v.literal("mobile")),
    itemCount: v.number(),
    paymentMethod: v.optional(v.string()),
    paymentMethodDetails: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    deliveryLatitude: v.optional(v.number()),
    deliveryLongitude: v.optional(v.number()),
    lalamoveQuotationId: v.optional(v.string()),
    hasUpsellItems: v.optional(v.boolean()),
    hasBundleItems: v.optional(v.boolean()),
    items: v.array(
      v.object({
        menuItemId: v.string(),
        menuItemName: v.string(),
        quantity: v.number(),
        price: v.number(),
        subtotal: v.number(),
        specialInstructions: v.optional(v.string()),
        variation: v.optional(v.string()),
        variationSelections: v.optional(
          v.array(
            v.object({
              typeName: v.string(),
              optionName: v.string(),
              priceAdjustment: v.number(),
            })
          )
        ),
        addons: v.optional(
          v.array(
            v.object({
              name: v.string(),
              price: v.number(),
              quantity: v.optional(v.number()),
            })
          )
        ),
        isUpsellItem: v.optional(v.boolean()),
        isBundleItem: v.optional(v.boolean()),
        bundleId: v.optional(v.string()),
      })
    ),
  },
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

    return orderId;
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, { status: args.status });
    return args.orderId;
  },
});

export const updatePaymentStatus = mutation({
  args: {
    orderId: v.id("orders"),
    paymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, { paymentStatus: args.paymentStatus });
  },
});

export const updateLalamoveDetails = mutation({
  args: {
    orderId: v.id("orders"),
    lalamoveOrderId: v.optional(v.string()),
    lalamoveStatus: v.optional(v.string()),
    lalamoveDriverName: v.optional(v.string()),
    lalamoveDriverPhone: v.optional(v.string()),
    lalamoveTrackingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orderId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(orderId, filtered);
  },
});

// --- QUERIES ---

export const getOrders = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("preparing"),
        v.literal("ready"),
        v.literal("delivered"),
        v.literal("cancelled")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("orders");

    if (args.status) {
      q = q.withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      q = q.withIndex("by_created").order("desc");
    }

    const orders = await q.take(args.limit ?? 50);
    return orders;
  },
});

export const getOrderById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return { ...order, items };
  },
});

export const getRealtimeQueue = query({
  handler: async (ctx) => {
    const statuses = ["pending", "confirmed", "preparing", "ready"] as const;
    const result: Record<string, any[]> = {};

    for (const status of statuses) {
      result[status] = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(50);
    }

    return result;
  },
});

export const getDashboardStats = query({
  handler: async (ctx) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_created")
      .order("desc")
      .collect();

    const todayOrders = allOrders.filter((o) => o._creationTime >= todayStart);

    const totalRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = todayOrders.length > 0 ? totalRevenue / todayOrders.length : 0;

    const statusCounts = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };

    for (const order of todayOrders) {
      statusCounts[order.status]++;
    }

    return {
      totalOrders: todayOrders.length,
      totalRevenue,
      avgOrderValue,
      statusCounts,
    };
  },
});
```

**Step 2: Create analytics.ts**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const trackEvent = mutation({
  args: {
    type: v.string(),
    metadata: v.optional(v.any()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("analyticsEvents", args);
  },
});

export const getUpsellAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const shown = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type_time", (q) => q.eq("type", "upsell_shown"))
      .collect();
    const clicked = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type_time", (q) => q.eq("type", "upsell_clicked"))
      .collect();
    const converted = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type_time", (q) => q.eq("type", "upsell_converted"))
      .collect();

    const shownCount = shown.filter((e) => e._creationTime >= cutoff).length;
    const clickedCount = clicked.filter((e) => e._creationTime >= cutoff).length;
    const convertedCount = converted.filter((e) => e._creationTime >= cutoff).length;

    return {
      shown: shownCount,
      clicked: clickedCount,
      converted: convertedCount,
      clickRate: shownCount > 0 ? clickedCount / shownCount : 0,
      conversionRate: shownCount > 0 ? convertedCount / shownCount : 0,
    };
  },
});

export const getBundleAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const viewed = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type_time", (q) => q.eq("type", "bundle_viewed"))
      .collect();
    const added = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type_time", (q) => q.eq("type", "bundle_added"))
      .collect();

    const viewedCount = viewed.filter((e) => e._creationTime >= cutoff).length;
    const addedCount = added.filter((e) => e._creationTime >= cutoff).length;

    return {
      viewed: viewedCount,
      added: addedCount,
      conversionRate: viewedCount > 0 ? addedCount / viewedCount : 0,
    };
  },
});

export const getTopItems = query({
  args: {
    daysBack: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const recentOrders = await ctx.db
      .query("orders")
      .withIndex("by_created")
      .collect();

    const filteredOrderIds = new Set(
      recentOrders
        .filter((o) => o._creationTime >= cutoff && o.status !== "cancelled")
        .map((o) => o._id)
    );

    const allItems = await ctx.db.query("orderItems").collect();
    const recentItems = allItems.filter((i) => filteredOrderIds.has(i.orderId));

    const itemMap = new Map<string, { name: string; count: number; revenue: number }>();

    for (const item of recentItems) {
      const existing = itemMap.get(item.menuItemId) ?? {
        name: item.menuItemName,
        count: 0,
        revenue: 0,
      };
      existing.count += item.quantity;
      existing.revenue += item.subtotal;
      itemMap.set(item.menuItemId, existing);
    }

    return Array.from(itemMap.entries())
      .map(([itemId, data]) => ({ itemId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, args.limit ?? 10);
  },
});

export const getTrends = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_date")
      .collect();

    const cutoffDate = new Date(cutoff).toISOString().split("T")[0];

    return stats
      .filter((s) => s.date >= cutoffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});
```

**Step 3: Create lalamove.ts**

```typescript
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const bookLalamove = action({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    // Read order from DB
    const order: any = await ctx.runQuery(internal.orders.getOrderById, {
      orderId: args.orderId,
    });

    if (!order || !order.lalamoveQuotationId || !order.deliveryAddress) {
      return { success: false, error: "Order missing delivery details" };
    }

    // Read Lalamove config from tenantConfig
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

    const configMap = new Map(configs.map((c: any) => [c.key, c.value]));
    const apiKey = configMap.get("lalamove_api_key");
    const secretKey = configMap.get("lalamove_secret_key");

    if (!apiKey || !secretKey) {
      return { success: false, error: "Lalamove not configured" };
    }

    const isSandbox = configMap.get("lalamove_sandbox") === "true";
    const baseUrl = isSandbox
      ? "https://rest.sandbox.lalamove.com"
      : "https://rest.lalamove.com";

    // Place the Lalamove order using the quotation
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
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});
```

**Step 4: Create config.ts (internal queries for tenantConfig)**

```typescript
import { v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";

export const getConfigs = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const results = [];
    for (const key of args.keys) {
      const config = await ctx.db
        .query("tenantConfig")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (config) results.push(config);
    }
    return results;
  },
});

export const upsertConfig = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tenantConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("tenantConfig", args);
    }
  },
});
```

**Step 5: Create crons.ts**

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "aggregate daily stats",
  { hourUTC: 23, minuteUTC: 59 },
  internal.statsAggregator.aggregateToday
);

export default crons;
```

**Step 6: Create statsAggregator.ts**

```typescript
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const aggregateToday = internalAction({
  handler: async (ctx) => {
    const stats = await ctx.runQuery(internal.orders.getDashboardStats, {});

    const today = new Date().toISOString().split("T")[0];

    // Get upsell analytics
    const upsellStats = await ctx.runQuery(internal.analytics.getUpsellAnalytics, {
      daysBack: 1,
    });

    // Get top items
    const topItems = await ctx.runQuery(internal.analytics.getTopItems, {
      daysBack: 1,
      limit: 10,
    });

    await ctx.runMutation(internal.statsAggregator.upsertDailyStats, {
      date: today,
      totalOrders: stats.totalOrders,
      totalRevenue: stats.totalRevenue,
      avgOrderValue: stats.avgOrderValue,
      upsellConversionRate: upsellStats.conversionRate,
      topItems,
    });
  },
});

export const upsertDailyStats = internalAction({
  handler: async () => {
    // This will be an internalMutation — see implementation
  },
});
```

Note: The `_generated/` folder and `api` imports are auto-generated by Convex when deployed. The template files reference them assuming they will exist post-deployment.

**Step 7: Commit**

```bash
git add convex-template/
git commit -m "feat: add Convex function templates (orders, analytics, lalamove, crons)"
```

---

### Task 4: Build the Auto-Deploy Server Action

When superadmin saves Convex credentials on a tenant, this server action pushes the schema to the tenant's Convex project using the CLI.

**Files:**
- Create: `src/lib/convex-deploy.ts`
- Create: `src/app/actions/convex.ts`
- Modify: `src/lib/tenants-service.ts` (call deploy after save)

**Step 1: Create convex-deploy.ts — the deployment utility**

This uses `child_process.exec` to run `npx convex deploy` with the tenant's deploy key, pointing at the template directory.

```typescript
// src/lib/convex-deploy.ts
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const CONVEX_TEMPLATE_DIR = path.join(process.cwd(), "convex-template");
const CURRENT_SCHEMA_VERSION = 1;

interface DeployResult {
  success: boolean;
  error?: string;
  schemaVersion: number;
}

export async function deployConvexSchema(
  deployKey: string,
  deploymentUrl: string
): Promise<DeployResult> {
  try {
    // Use convex deploy with the template directory
    const { stdout, stderr } = await execAsync(
      `CONVEX_DEPLOY_KEY="${deployKey}" npx convex deploy --cmd 'echo "deployed"'`,
      {
        cwd: CONVEX_TEMPLATE_DIR,
        timeout: 60000,
        env: {
          ...process.env,
          CONVEX_DEPLOY_KEY: deployKey,
        },
      }
    );

    if (stderr && stderr.includes("error")) {
      return { success: false, error: stderr, schemaVersion: 0 };
    }

    return { success: true, schemaVersion: CURRENT_SCHEMA_VERSION };
  } catch (error: any) {
    return {
      success: false,
      error: error.message ?? "Unknown deployment error",
      schemaVersion: 0,
    };
  }
}

export async function validateConvexCredentials(
  deploymentUrl: string,
  deployKey: string
): Promise<boolean> {
  try {
    // Ping the Convex deployment to validate credentials
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

    // A 400 (function not found) means credentials are valid
    // A 401/403 means credentials are invalid
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
      await fetch(`${deploymentUrl}/api/mutation`, {
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
    }
    return true;
  } catch {
    return false;
  }
}

export { CURRENT_SCHEMA_VERSION };
```

**Step 2: Create server action**

```typescript
// src/app/actions/convex.ts
"use server";

import {
  deployConvexSchema,
  validateConvexCredentials,
  syncTenantConfig,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/convex-deploy";
import { createClient } from "@/lib/supabase/admin";

export async function deployConvexToTenantAction(tenantId: string) {
  const supabase = createClient();

  // Fetch tenant with Convex credentials
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select(
      "convex_deployment_url, convex_deploy_key, lalamove_enabled, lalamove_api_key, lalamove_secret_key, lalamove_market, lalamove_service_type, lalamove_sandbox, restaurant_address, restaurant_latitude, restaurant_longitude"
    )
    .eq("id", tenantId)
    .single();

  if (error || !tenant?.convex_deployment_url || !tenant?.convex_deploy_key) {
    return { success: false, error: "Missing Convex credentials" };
  }

  // Validate credentials
  const isValid = await validateConvexCredentials(
    tenant.convex_deployment_url,
    tenant.convex_deploy_key
  );

  if (!isValid) {
    return { success: false, error: "Invalid Convex credentials" };
  }

  // Deploy schema
  const deployResult = await deployConvexSchema(
    tenant.convex_deploy_key,
    tenant.convex_deployment_url
  );

  if (!deployResult.success) {
    return { success: false, error: deployResult.error };
  }

  // Sync tenant config (Lalamove creds, restaurant address)
  const configs: Record<string, string> = {};

  if (tenant.lalamove_enabled && tenant.lalamove_api_key) {
    configs.lalamove_api_key = tenant.lalamove_api_key;
    configs.lalamove_secret_key = tenant.lalamove_secret_key ?? "";
    configs.lalamove_market = tenant.lalamove_market ?? "PH";
    configs.lalamove_service_type = tenant.lalamove_service_type ?? "MOTORCYCLE";
    configs.lalamove_sandbox = String(tenant.lalamove_sandbox ?? true);
  }

  if (tenant.restaurant_address) {
    configs.restaurant_address = tenant.restaurant_address;
    configs.restaurant_latitude = String(tenant.restaurant_latitude ?? 0);
    configs.restaurant_longitude = String(tenant.restaurant_longitude ?? 0);
  }

  if (Object.keys(configs).length > 0) {
    await syncTenantConfig(
      tenant.convex_deployment_url,
      tenant.convex_deploy_key,
      configs
    );
  }

  // Update schema version
  await supabase
    .from("tenants")
    .update({
      convex_schema_version: CURRENT_SCHEMA_VERSION,
      app_enabled: true,
    })
    .eq("id", tenantId);

  return { success: true, schemaVersion: CURRENT_SCHEMA_VERSION };
}

export async function bulkDeployConvexAction() {
  const supabase = createClient();

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, convex_deployment_url, convex_deploy_key, convex_schema_version")
    .not("convex_deployment_url", "is", null)
    .not("convex_deploy_key", "is", null)
    .lt("convex_schema_version", CURRENT_SCHEMA_VERSION);

  if (!tenants?.length) {
    return { success: true, updated: 0, errors: [] };
  }

  const results = { updated: 0, errors: [] as string[] };

  for (const tenant of tenants) {
    const result = await deployConvexToTenantAction(tenant.id);
    if (result.success) {
      results.updated++;
    } else {
      results.errors.push(`Tenant ${tenant.id}: ${result.error}`);
    }
  }

  return { success: true, ...results };
}
```

**Step 3: Commit**

```bash
git add src/lib/convex-deploy.ts src/app/actions/convex.ts
git commit -m "feat: add Convex auto-deploy server action for tenant provisioning"
```

---

### Task 5: Update Superadmin Tenant Form — Add Convex Fields

**Files:**
- Modify: `src/components/superadmin/tenant-form.tsx` (add Convex credential fields + deploy button)

**Step 1: Add Convex fields to the form**

Add a new "Convex / Mobile App" section to the tenant form with:
- `convex_deployment_url` — text input
- `convex_deploy_key` — password input
- "Deploy Schema" button that calls `deployConvexToTenantAction`
- Status indicator showing current `convex_schema_version`

The form should:
1. Show the Convex fields only when editing (not creating — need tenant ID first)
2. On save, if Convex credentials are present and changed, auto-trigger deployment
3. Show deployment status (loading, success, error)

**Step 2: Add the deploy button handler**

```typescript
const handleDeployConvex = async () => {
  if (!tenantId) return;
  setIsDeploying(true);
  try {
    const result = await deployConvexToTenantAction(tenantId);
    if (result.success) {
      toast.success("Convex schema deployed successfully");
    } else {
      toast.error(`Deploy failed: ${result.error}`);
    }
  } finally {
    setIsDeploying(false);
  }
};
```

**Step 3: Commit**

```bash
git add src/components/superadmin/tenant-form.tsx
git commit -m "feat: add Convex credential fields and auto-deploy to tenant form"
```

---

## Phase 2: Order Flow Integration

### Task 6: Create Convex Client Factory for Web

**Files:**
- Create: `src/lib/convex/client.ts` (browser Convex client factory)
- Create: `src/lib/convex/server.ts` (server-side Convex HTTP client)

**Step 1: Create browser client**

```typescript
// src/lib/convex/client.ts
import { ConvexReactClient } from "convex/react";

const clientCache = new Map<string, ConvexReactClient>();

export function getConvexClient(deploymentUrl: string): ConvexReactClient {
  if (!clientCache.has(deploymentUrl)) {
    clientCache.set(deploymentUrl, new ConvexReactClient(deploymentUrl));
  }
  return clientCache.get(deploymentUrl)!;
}
```

**Step 2: Create server client for API calls**

```typescript
// src/lib/convex/server.ts

interface ConvexServerClient {
  mutation<T = any>(path: string, args: Record<string, any>): Promise<T>;
  query<T = any>(path: string, args: Record<string, any>): Promise<T>;
  action<T = any>(path: string, args: Record<string, any>): Promise<T>;
}

export function createConvexServerClient(
  deploymentUrl: string,
  deployKey: string
): ConvexServerClient {
  async function call<T>(type: "mutation" | "query" | "action", path: string, args: Record<string, any>): Promise<T> {
    const response = await fetch(`${deploymentUrl}/api/${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${deployKey}`,
      },
      body: JSON.stringify({ path, args, format: "json" }),
    });

    const data = await response.json();

    if (data.status === "error") {
      throw new Error(data.errorMessage ?? "Convex call failed");
    }

    return data.value as T;
  }

  return {
    mutation: <T = any>(path: string, args: Record<string, any>) => call<T>("mutation", path, args),
    query: <T = any>(path: string, args: Record<string, any>) => call<T>("query", path, args),
    action: <T = any>(path: string, args: Record<string, any>) => call<T>("action", path, args),
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/convex/
git commit -m "feat: add Convex client factories for browser and server"
```

---

### Task 7: Modify Web Checkout to Write to Convex

**Files:**
- Modify: `src/lib/orders-service.ts` (add Convex-aware order creation)
- Modify: `src/app/actions/orders.ts` (route to Convex when tenant has it)

**Step 1: Add Convex order creation to orders-service.ts**

Add a new function `createOrderConvex` alongside the existing `createOrder`:

```typescript
export async function createOrderConvex(
  tenant: { convex_deployment_url: string; convex_deploy_key: string },
  items: OrderItem[],
  orderData: OrderData
) {
  const convex = createConvexServerClient(
    tenant.convex_deployment_url,
    tenant.convex_deploy_key
  );

  const orderId = await convex.mutation("orders:createOrder", {
    ...orderData,
    source: "web",
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    items: items.map((item) => ({
      menuItemId: item.menu_item_id,
      menuItemName: item.menu_item_name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
      specialInstructions: item.special_instructions ?? undefined,
      variation: item.variation ?? undefined,
      addons: item.addons?.map((a: any) =>
        typeof a === "string"
          ? { name: a, price: 0 }
          : { name: a.name, price: a.price, quantity: a.quantity }
      ),
    })),
  });

  return { orderId, success: true };
}
```

**Step 2: Update createOrderAction to check tenant Convex config**

In the action, before creating the order:
```typescript
// Fetch tenant to check if Convex is enabled
const { data: tenant } = await supabase
  .from("tenants")
  .select("convex_deployment_url, convex_deploy_key")
  .eq("id", tenantId)
  .single();

if (tenant?.convex_deployment_url && tenant?.convex_deploy_key) {
  // Route to Convex
  return createOrderConvex(tenant, items, orderData);
} else {
  // Existing Supabase flow
  return createOrder(tenantId, items, ...);
}
```

**Step 3: Run existing tests to verify no regression**

Run: `npm run test -- --testPathPattern="orders"`

**Step 4: Commit**

```bash
git add src/lib/orders-service.ts src/app/actions/orders.ts
git commit -m "feat: route order creation to Convex for enabled tenants"
```

---

### Task 8: Modify Mobile App Checkout to Write to Convex

**Files:**
- Modify: `mobile/app/(main)/checkout.tsx`
- Create: `mobile/lib/convex.ts` (Convex client for mobile)

**Step 1: Create mobile Convex client**

```typescript
// mobile/lib/convex.ts
import { ConvexReactClient } from "convex/react";

let client: ConvexReactClient | null = null;

export function getConvexClient(url: string): ConvexReactClient {
  if (!client || (client as any).address !== url) {
    client = new ConvexReactClient(url, {
      unsavedChangesWarning: false,
    });
  }
  return client;
}
```

**Step 2: Update checkout to write to Convex**

In `checkout.tsx`, modify `handleSubmitOrder` to call Convex mutation instead of Supabase insert when the tenant has a `convex_deployment_url`.

**Step 3: Commit**

```bash
git add mobile/lib/convex.ts mobile/app/(main)/checkout.tsx
git commit -m "feat: mobile checkout writes to Convex for enabled tenants"
```

---

### Task 9: Update Web Admin Orders Page to Read from Convex

**Files:**
- Modify: `src/app/[tenant]/admin/orders/page.tsx`
- Modify: `src/components/admin/realtime-orders-wrapper.tsx`
- Create: `src/hooks/use-convex-orders.ts`

**Step 1: Create Convex orders hook**

A hook that uses the Convex React client to subscribe to real-time orders:

```typescript
// src/hooks/use-convex-orders.ts
"use client";

import { useQuery } from "convex/react";

export function useConvexOrders(status?: string) {
  // Uses Convex's real-time subscription
  const orders = useQuery("orders:getOrders" as any, status ? { status } : {});
  return orders;
}

export function useConvexOrderQueue() {
  const queue = useQuery("orders:getRealtimeQueue" as any);
  return queue;
}

export function useConvexDashboardStats() {
  const stats = useQuery("orders:getDashboardStats" as any);
  return stats;
}
```

**Step 2: Update orders page to detect Convex and render accordingly**

The admin orders page checks if the tenant has Convex configured. If so, it wraps children with `ConvexProvider` and uses Convex queries. Otherwise, existing Supabase flow.

**Step 3: Commit**

```bash
git add src/hooks/use-convex-orders.ts src/app/[tenant]/admin/orders/page.tsx src/components/admin/realtime-orders-wrapper.tsx
git commit -m "feat: admin orders page reads from Convex for enabled tenants"
```

---

## Phase 3: Analytics Event Tracking

### Task 10: Create Analytics Hook for Web

**Files:**
- Create: `src/hooks/use-analytics.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/use-analytics.ts
"use client";

import { useMutation } from "convex/react";
import { useCallback, useRef, useEffect } from "react";

interface AnalyticsEvent {
  type: string;
  metadata?: Record<string, any>;
}

export function useAnalytics() {
  const trackEventMutation = useMutation("analytics:trackEvent" as any);
  const buffer = useRef<AnalyticsEvent[]>([]);
  const sessionId = useRef(crypto.randomUUID());

  const flush = useCallback(async () => {
    const events = buffer.current.splice(0);
    for (const event of events) {
      try {
        await trackEventMutation({
          type: event.type,
          metadata: event.metadata,
          sessionId: sessionId.current,
        });
      } catch {
        // Silent fail for analytics
      }
    }
  }, [trackEventMutation]);

  // Flush every 5 seconds
  useEffect(() => {
    const interval = setInterval(flush, 5000);
    return () => {
      clearInterval(interval);
      flush(); // Flush on unmount
    };
  }, [flush]);

  const trackEvent = useCallback((type: string, metadata?: Record<string, any>) => {
    buffer.current.push({ type, metadata });
  }, []);

  return { trackEvent };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-analytics.ts
git commit -m "feat: add useAnalytics hook for Convex event tracking"
```

---

### Task 11: Instrument Existing Components with Event Tracking

**Files:**
- Modify: `src/app/[tenant]/menu/item/[itemId]/` — track `item_viewed`
- Modify: `src/components/customer/` checkout interstitial — track `upsell_shown`, `upsell_clicked`, `upsell_converted`
- Modify: Cart components — track `add_to_cart`
- Modify: Checkout page — track `checkout_started`, `checkout_completed`

**Step 1: Add item_viewed tracking to product detail page**

In the product detail client component, add:
```typescript
const { trackEvent } = useAnalytics();

useEffect(() => {
  trackEvent("item_viewed", {
    itemId: item.id,
    categoryId: item.category_id,
    bcgClass: item.bcg_classification,
  });
}, [item.id]);
```

**Step 2: Add upsell tracking to checkout interstitial**

When the interstitial is shown: `trackEvent("upsell_shown", { itemIds, upsellType })`
When an item is clicked: `trackEvent("upsell_clicked", { itemId, upsellType })`
When an item is added: `trackEvent("upsell_converted", { itemId, upsellType, addedPrice })`

**Step 3: Add cart and checkout tracking**

Add `add_to_cart` event in the cart context/hook.
Add `checkout_started` when checkout page mounts.
Add `checkout_completed` after successful order.

**Step 4: Commit**

```bash
git add src/app/[tenant]/menu/ src/components/customer/ src/hooks/useCart.tsx
git commit -m "feat: instrument web components with analytics event tracking"
```

---

### Task 12: Add Analytics Tracking to Mobile App

**Files:**
- Create: `mobile/hooks/use-analytics.ts`
- Modify: `mobile/app/(main)/item/[itemId].tsx` — track `item_viewed`
- Modify: `mobile/app/(main)/checkout.tsx` — track checkout events
- Modify: `mobile/stores/cart-store.ts` — track `add_to_cart`

Same pattern as web but using the mobile Convex client.

**Step 1: Create mobile analytics hook**

Same as web hook but adapted for React Native (no `beforeunload`, use `AppState` listener instead).

**Step 2: Instrument mobile screens**

**Step 3: Commit**

```bash
git add mobile/hooks/use-analytics.ts mobile/app/(main)/ mobile/stores/cart-store.ts
git commit -m "feat: add analytics event tracking to mobile app"
```

---

## Phase 4: WebNegosyo Admin App (React Native)

### Task 13: Scaffold the WebNegosyo Admin App

**Files:**
- Create: `webnegosyo-app/` (entire Expo project)

**Step 1: Initialize Expo project**

```bash
cd /Users/codemedavid/Documents/whitelabel
npx create-expo-app@latest webnegosyo-app --template blank-typescript
```

**Step 2: Install dependencies**

```bash
cd webnegosyo-app
npx expo install convex @supabase/supabase-js react-native-async-storage/async-storage expo-secure-store expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
npm install @react-navigation/native zustand react-native-chart-kit react-native-svg
```

**Step 3: Set up app.config.ts**

```typescript
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "WebNegosyo",
  slug: "webnegosyo-app",
  scheme: "webnegosyo-admin",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#111111",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.webnegosyo.admin",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#111111",
    },
    package: "com.webnegosyo.admin",
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  plugins: ["expo-router", "expo-secure-store"],
});
```

**Step 4: Commit**

```bash
git add webnegosyo-app/
git commit -m "feat: scaffold webnegosyo admin app (Expo)"
```

---

### Task 14: Auth Flow — Supabase Login + Convex Connection

**Files:**
- Create: `webnegosyo-app/lib/supabase.ts`
- Create: `webnegosyo-app/lib/convex-provider.tsx`
- Create: `webnegosyo-app/stores/auth-store.ts`
- Create: `webnegosyo-app/app/(auth)/login.tsx`
- Create: `webnegosyo-app/app/_layout.tsx`

**Step 1: Create Supabase client**

```typescript
// webnegosyo-app/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

**Step 2: Create auth store**

```typescript
// webnegosyo-app/stores/auth-store.ts
import { create } from "zustand";

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  convexUrl: string | null;
  isLoading: boolean;
  setAuth: (data: Partial<AuthState>) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  tenantId: null,
  tenantSlug: null,
  convexUrl: null,
  isLoading: true,
  setAuth: (data) => set(data),
  clear: () =>
    set({
      userId: null,
      tenantId: null,
      tenantSlug: null,
      convexUrl: null,
      isLoading: false,
    }),
}));
```

**Step 3: Create Convex provider with Supabase auth bridge**

```typescript
// webnegosyo-app/lib/convex-provider.tsx
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { useAuthStore } from "../stores/auth-store";
import { Session } from "@supabase/supabase-js";

export function ConvexAuthProvider({ children }: { children: React.ReactNode }) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl, {
      unsavedChangesWarning: false,
    });
  }, [convexUrl]);

  if (!client) return <>{children}</>;

  return (
    <ConvexProviderWithAuth client={client} useAuth={useSupabaseAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (forceRefreshToken) {
        const { data } = await supabase.auth.refreshSession();
        return data.session?.access_token ?? null;
      }
      return session?.access_token ?? null;
    },
    [session]
  );

  return useMemo(
    () => ({ isLoading, isAuthenticated: !!session, fetchAccessToken }),
    [isLoading, session, fetchAccessToken]
  );
}
```

**Step 4: Create login screen**

```typescript
// webnegosyo-app/app/(auth)/login.tsx
// Email/password login form that:
// 1. Calls supabase.auth.signInWithPassword
// 2. Fetches the user's tenant from app_users table
// 3. Fetches the tenant's convex_deployment_url
// 4. Sets auth store with tenantId, convexUrl
// 5. Navigates to (main)/dashboard
```

**Step 5: Create root layout**

```typescript
// webnegosyo-app/app/_layout.tsx
// Wraps with: ConvexAuthProvider > Stack
// Checks auth state: if no session → (auth)/login, else → (main)/dashboard
```

**Step 6: Commit**

```bash
git add webnegosyo-app/
git commit -m "feat: implement auth flow with Supabase login and Convex connection"
```

---

### Task 15: Dashboard Screen — Real-Time Stats

**Files:**
- Create: `webnegosyo-app/app/(main)/dashboard.tsx`
- Create: `webnegosyo-app/components/stat-card.tsx`
- Create: `webnegosyo-app/components/order-queue.tsx`

**Step 1: Create dashboard screen**

Uses Convex `useQuery` for real-time subscriptions to:
- `getDashboardStats` — today's totals
- `getRealtimeQueue` — live order queue

Shows:
- Stat cards: orders today, revenue, avg order value
- Status breakdown: pending / confirmed / preparing / ready
- Live order queue with recent orders

**Step 2: Commit**

```bash
git add webnegosyo-app/app/(main)/dashboard.tsx webnegosyo-app/components/
git commit -m "feat: add real-time dashboard screen"
```

---

### Task 16: Orders Screen — Real-Time List + Status Management

**Files:**
- Create: `webnegosyo-app/app/(main)/orders.tsx`
- Create: `webnegosyo-app/app/(main)/order/[orderId].tsx`
- Create: `webnegosyo-app/components/order-card.tsx`
- Create: `webnegosyo-app/components/order-status-actions.tsx`

**Step 1: Create orders list screen**

Real-time list using `useQuery("orders:getOrders")`. Filterable by status. Each order card shows customer name, total, item count, status badge, time.

**Step 2: Create order detail screen**

Shows full order with items (including variations, addons, special instructions). Action buttons to update status: Confirm → Prepare → Ready → Delivered. If delivery order with Lalamove, shows "Book Delivery" button that calls `bookLalamove` action.

**Step 3: Commit**

```bash
git add webnegosyo-app/app/(main)/orders.tsx webnegosyo-app/app/(main)/order/ webnegosyo-app/components/
git commit -m "feat: add orders screen with real-time updates and status management"
```

---

### Task 17: Analytics Screen — Upsell & Bundle Performance

**Files:**
- Create: `webnegosyo-app/app/(main)/analytics.tsx`
- Create: `webnegosyo-app/components/upsell-funnel.tsx`
- Create: `webnegosyo-app/components/bundle-stats.tsx`
- Create: `webnegosyo-app/components/top-items-list.tsx`

**Step 1: Create analytics screen**

Uses Convex queries:
- `getUpsellAnalytics` — shows funnel: impressions → clicks → conversions with rates
- `getBundleAnalytics` — bundle views → adds with conversion rate
- `getTopItems` — most popular items by revenue and count

**Step 2: Commit**

```bash
git add webnegosyo-app/app/(main)/analytics.tsx webnegosyo-app/components/
git commit -m "feat: add analytics screen with upsell funnel and bundle stats"
```

---

### Task 18: Trends Screen — Charts

**Files:**
- Create: `webnegosyo-app/app/(main)/trends.tsx`
- Create: `webnegosyo-app/components/revenue-chart.tsx`
- Create: `webnegosyo-app/components/order-volume-chart.tsx`

**Step 1: Create trends screen**

Uses `react-native-chart-kit` and Convex `getTrends` query. Shows:
- Revenue line chart (daily/weekly/monthly toggle)
- Order volume bar chart
- Average order value trend

**Step 2: Commit**

```bash
git add webnegosyo-app/app/(main)/trends.tsx webnegosyo-app/components/
git commit -m "feat: add trends screen with revenue and order volume charts"
```

---

### Task 19: Bottom Tab Navigation

**Files:**
- Modify: `webnegosyo-app/app/(main)/_layout.tsx`

**Step 1: Set up tab navigation**

Use Expo Router's `Tabs` layout:
- Dashboard (home icon)
- Orders (list icon)
- Analytics (chart icon)
- Trends (trending-up icon)
- Settings (gear icon)

**Step 2: Commit**

```bash
git add webnegosyo-app/app/(main)/_layout.tsx
git commit -m "feat: add bottom tab navigation for admin app"
```

---

## Phase 5: Lalamove Integration in Convex

### Task 20: Lalamove Webhook Handler

**Files:**
- Create: `src/app/api/lalamove-convex/route.ts`

**Step 1: Create webhook route**

When Lalamove sends status updates, this route:
1. Validates the webhook payload
2. Looks up which tenant owns the Lalamove order
3. Calls the tenant's Convex `updateLalamoveDetails` mutation via HTTP API

```typescript
// src/app/api/lalamove-convex/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { orderId, status, driverName, driverPhone, shareLink } = body;

  // Look up which tenant has this Lalamove order
  // (requires querying all Convex-enabled tenants or maintaining a lookup table)
  // For now, the webhook URL includes the tenant ID as a query param

  const tenantId = request.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant_id" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("convex_deployment_url, convex_deploy_key")
    .eq("id", tenantId)
    .single();

  if (!tenant?.convex_deployment_url) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Update the order in Convex
  await fetch(`${tenant.convex_deployment_url}/api/mutation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${tenant.convex_deploy_key}`,
    },
    body: JSON.stringify({
      path: "orders:updateLalamoveDetails",
      args: {
        orderId,
        lalamoveStatus: status,
        lalamoveDriverName: driverName,
        lalamoveDriverPhone: driverPhone,
        lalamoveTrackingUrl: shareLink,
      },
      format: "json",
    }),
  });

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/lalamove-convex/route.ts
git commit -m "feat: add Lalamove webhook handler for Convex orders"
```

---

## Phase 6: Testing & Polish

### Task 21: Add Tests for Convex Deploy Utility

**Files:**
- Create: `tests/unit/convex-deploy.test.ts`

**Step 1: Write tests for validateConvexCredentials and syncTenantConfig**

Test credential validation, config syncing, and error handling. Mock fetch calls.

**Step 2: Run tests**

```bash
npm run test -- --testPathPattern="convex-deploy"
```

**Step 3: Commit**

```bash
git add tests/unit/convex-deploy.test.ts
git commit -m "test: add tests for Convex deploy utility"
```

---

### Task 22: Add Convex Template Package.json and Setup

**Files:**
- Create: `convex-template/package.json`
- Create: `convex-template/tsconfig.json`

The template directory needs its own package.json so `npx convex deploy` can run within it.

```json
{
  "name": "webnegosyo-convex-template",
  "private": true,
  "dependencies": {
    "convex": "^1.17.0"
  }
}
```

**Step 1: Create package.json and tsconfig**

**Step 2: Run `npm install` in the template directory**

**Step 3: Verify `npx convex deploy --dry-run` works**

**Step 4: Commit**

```bash
git add convex-template/package.json convex-template/tsconfig.json
git commit -m "feat: add Convex template project configuration"
```

---

### Task 23: Update Mobile App to Support Convex Provider

**Files:**
- Modify: `mobile/app/_layout.tsx` (wrap with ConvexProvider when tenant has Convex)
- Create: `mobile/lib/convex-provider.tsx`

The customer mobile app needs a ConvexProvider for analytics tracking and order creation.

**Step 1: Create mobile ConvexProvider**

Similar to webnegosyo-app's provider but the Convex URL comes from the tenant's config (fetched from Supabase on app init).

**Step 2: Update root layout**

**Step 3: Commit**

```bash
git add mobile/lib/convex-provider.tsx mobile/app/_layout.tsx
git commit -m "feat: add Convex provider to customer mobile app"
```

---

### Task 24: Lint and Build Verification

**Step 1: Run linter**

```bash
npm run lint
```

Fix any lint errors.

**Step 2: Run build**

```bash
npm run build
```

Fix any type errors.

**Step 3: Run tests**

```bash
npm run test
```

Ensure all tests pass.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint and build errors"
```

---

## Dependency Graph

```
Task 1 (DB migration) → Task 2 (schema template) → Task 3 (functions template)
Task 3 → Task 4 (auto-deploy action) → Task 5 (superadmin form)
Task 1 → Task 6 (Convex client factory) → Task 7 (web checkout) → Task 9 (admin orders)
Task 6 → Task 8 (mobile checkout)
Task 6 → Task 10 (analytics hook) → Task 11 (web instrumentation)
Task 10 → Task 12 (mobile instrumentation)
Task 13 (scaffold app) → Task 14 (auth) → Task 15 (dashboard) → Task 16 (orders)
Task 15 → Task 17 (analytics) → Task 18 (trends)
Task 16 → Task 19 (tab nav)
Task 7 → Task 20 (Lalamove webhook)
Task 4 → Task 22 (template setup)
Task 8 → Task 23 (mobile Convex provider)
All → Task 21 (tests) → Task 24 (lint/build)
```
