# Tenant Email Notifications via PostHog — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable tenants to receive order notification emails via PostHog Workflows, triggered by a server-side `order_created` event capture.

**Architecture:** Add `admin_email` + `email_notifications_enabled` to the tenants table. Install `posthog-node` server SDK. After each order creation (both Supabase and Convex paths), fire an async `order_created` event to PostHog with full order details. PostHog Workflow (configured manually in dashboard) sends the email.

**Tech Stack:** posthog-node, Supabase (migration), Next.js server actions, TypeScript

---

### Task 1: Database Migration — Add Email Columns to Tenants

**Files:**
- Create: Supabase migration via `mcp__supabase__apply_migration`

**Step 1: Apply the migration**

```sql
ALTER TABLE tenants
ADD COLUMN admin_email text,
ADD COLUMN email_notifications_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.admin_email IS 'Optional email address for order notification delivery';
COMMENT ON COLUMN tenants.email_notifications_enabled IS 'Feature flag: send email notifications on new orders via PostHog';
```

Run via Supabase MCP tool `apply_migration` with name `add_tenant_email_notifications`.

**Step 2: Verify migration applied**

Run SQL: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'tenants' AND column_name IN ('admin_email', 'email_notifications_enabled');`

Expected: Two rows — `admin_email` (text, YES nullable) and `email_notifications_enabled` (boolean, NOT NULL, default false).

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts:113-118` (before `created_at`)

**Step 1: Add fields to the Tenant interface**

In `src/types/database.ts`, add these two fields just before `created_at` (around line 115):

```typescript
  // Email notifications
  admin_email?: string | null;
  email_notifications_enabled?: boolean;
```

Insert between the `android_package_name` line and the `created_at` line.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No new errors related to `admin_email` or `email_notifications_enabled`.

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add admin_email and email_notifications_enabled to Tenant type"
```

---

### Task 3: Install posthog-node

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install posthog-node`

**Step 2: Verify installation**

Run: `node -e "const { PostHog } = require('posthog-node'); console.log('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add posthog-node dependency"
```

---

### Task 4: Create PostHog Client Module

**Files:**
- Create: `src/lib/posthog.ts`
- Test: `tests/unit/lib/posthog.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/lib/posthog.test.ts`:

```typescript
import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Mock posthog-node before importing
jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}))

describe('posthog client', () => {
  beforeEach(() => {
    jest.resetModules()
    // Clear env vars
    delete process.env.POSTHOG_API_KEY
    delete process.env.POSTHOG_HOST
  })

  test('getPostHogClient returns null when POSTHOG_API_KEY is missing', async () => {
    const { getPostHogClient } = await import('@/lib/posthog')
    const client = getPostHogClient()
    expect(client).toBeNull()
  })

  test('getPostHogClient returns a client when env vars are set', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key'
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com'
    const { getPostHogClient } = await import('@/lib/posthog')
    const client = getPostHogClient()
    expect(client).not.toBeNull()
  })

  test('captureOrderCreated no-ops when client is null', async () => {
    const { captureOrderCreated } = await import('@/lib/posthog')
    // Should not throw
    await expect(
      captureOrderCreated({
        tenantId: 'tenant-1',
        tenantName: 'Test Restaurant',
        tenantSlug: 'test-restaurant',
        adminEmail: 'admin@test.com',
        orderId: 'order-1',
        customerName: 'John',
        customerContact: '09171234567',
        items: [{ name: 'Burger', quantity: 1, variation: null, addons: [], subtotal: 150 }],
        orderTotal: 150,
        deliveryFee: 0,
        orderType: 'pickup',
        paymentMethod: 'Cash',
        deliveryAddress: null,
      })
    ).resolves.toBeUndefined()
  })

  test('captureOrderCreated calls posthog.capture when client is available', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test_key'
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com'
    const { PostHog } = await import('posthog-node')
    const mockCapture = jest.fn()
    ;(PostHog as jest.MockedClass<typeof PostHog>).mockImplementation(() => ({
      capture: mockCapture,
      shutdown: jest.fn().mockResolvedValue(undefined),
    }) as unknown as InstanceType<typeof PostHog>)

    jest.resetModules()
    const { captureOrderCreated } = await import('@/lib/posthog')
    await captureOrderCreated({
      tenantId: 'tenant-1',
      tenantName: 'Test Restaurant',
      tenantSlug: 'test-restaurant',
      adminEmail: 'admin@test.com',
      orderId: 'order-1',
      customerName: 'John',
      customerContact: '09171234567',
      items: [{ name: 'Burger', quantity: 1, variation: null, addons: [], subtotal: 150 }],
      orderTotal: 150,
      deliveryFee: 0,
      orderType: 'pickup',
      paymentMethod: 'Cash',
      deliveryAddress: null,
    })

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'tenant_tenant-1',
        event: 'order_created',
      })
    )
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="posthog" --verbose`

Expected: FAIL — module `@/lib/posthog` not found.

**Step 3: Write the implementation**

Create `src/lib/posthog.ts`:

```typescript
import { PostHog } from 'posthog-node'

let client: PostHog | null = null
let initialized = false

export function getPostHogClient(): PostHog | null {
  if (initialized) return client

  const apiKey = process.env.POSTHOG_API_KEY
  const host = process.env.POSTHOG_HOST

  if (!apiKey || !host) {
    initialized = true
    return null
  }

  client = new PostHog(apiKey, { host })
  initialized = true
  return client
}

export interface OrderEventData {
  tenantId: string
  tenantName: string
  tenantSlug: string
  adminEmail: string
  orderId: string
  customerName: string | undefined
  customerContact: string | undefined
  items: Array<{
    name: string
    quantity: number
    variation: string | null | undefined
    addons: string[] | { name: string; price: number }[]
    subtotal: number
  }>
  orderTotal: number
  deliveryFee: number
  orderType: string | null | undefined
  paymentMethod: string | null | undefined
  deliveryAddress: string | null | undefined
}

export async function captureOrderCreated(data: OrderEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    posthog.capture({
      distinctId: `tenant_${data.tenantId}`,
      event: 'order_created',
      properties: {
        tenant_name: data.tenantName,
        tenant_slug: data.tenantSlug,
        order_id: data.orderId,
        customer_name: data.customerName ?? 'Guest',
        customer_contact: data.customerContact ?? '',
        items: data.items,
        order_total: data.orderTotal,
        delivery_fee: data.deliveryFee,
        order_type: data.orderType ?? 'unknown',
        payment_method: data.paymentMethod ?? 'Not specified',
        delivery_address: data.deliveryAddress ?? '',
      },
      $set: {
        email: data.adminEmail,
        name: data.tenantName,
      },
    })
  } catch (error) {
    // Fire-and-forget: log but never block the order flow
    console.error('[PostHog] Failed to capture order_created event:', error)
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="posthog" --verbose`

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/posthog.ts tests/unit/lib/posthog.test.ts
git commit -m "feat: add PostHog client with captureOrderCreated helper"
```

---

### Task 5: Integrate PostHog Capture into Order Creation

**Files:**
- Modify: `src/app/actions/orders.ts:57-136`

**Step 1: Add PostHog capture to createOrderAction**

In `src/app/actions/orders.ts`, modify `createOrderAction` to:

1. Expand the tenant config query (line 89-91) to also fetch `admin_email`, `email_notifications_enabled`, `name`, and `slug`
2. After both the Convex path (line 114) and Supabase path (line 132), add an async PostHog capture call

The tenant query at line 88-92 changes from:

```typescript
    const { data: tenantConfigData } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, convex_deploy_key')
      .eq('id', tenantId)
      .single()
```

to:

```typescript
    const { data: tenantConfigData } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, convex_deploy_key, admin_email, email_notifications_enabled, name, slug')
      .eq('id', tenantId)
      .single()
```

Then add a helper call at the end of the try block (before the catch), after both return paths. The cleanest approach: extract the PostHog capture into a local async function that fires after each order path returns.

Actually, since both paths return inside the try block, the capture needs to happen BEFORE the return in each path. Add this helper inside the function:

```typescript
    // Fire-and-forget PostHog email notification
    const firePostHogNotification = (orderId: string, orderItems: typeof items) => {
      if (tenantConfig?.email_notifications_enabled && tenantConfig?.admin_email) {
        import('@/lib/posthog').then(({ captureOrderCreated }) => {
          captureOrderCreated({
            tenantId,
            tenantName: tenantConfig.name ?? '',
            tenantSlug: tenantConfig.slug ?? '',
            adminEmail: tenantConfig.admin_email,
            orderId,
            customerName: customerInfo?.name,
            customerContact: customerInfo?.contact,
            items: orderItems.map(i => ({
              name: i.menu_item_name,
              quantity: i.quantity,
              variation: i.variation ?? null,
              addons: i.addons,
              subtotal: i.subtotal,
            })),
            orderTotal: orderItems.reduce((sum, i) => sum + i.subtotal, 0) + (deliveryFee ?? 0),
            deliveryFee: deliveryFee ?? 0,
            orderType: null, // order type name not available at this level
            paymentMethod: paymentMethodName ?? null,
            deliveryAddress: (customerData?.address as string) ?? null,
          })
        }).catch(() => {
          // Silent fail - never block orders
        })
      }
    }
```

Then call `firePostHogNotification(result.order.id ?? result.order, items)` before each return statement:
- Line ~113 (Convex path): `firePostHogNotification(result.order.id, items)`
- Line ~131 (Supabase path): `firePostHogNotification(result.order.id, items)`

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "orders.ts" | head -5`

Expected: No new errors.

**Step 3: Run lint**

Run: `npm run lint`

Expected: No new lint errors in orders.ts.

**Step 4: Commit**

```bash
git add src/app/actions/orders.ts
git commit -m "feat: capture order_created event to PostHog for email notifications"
```

---

### Task 6: Add Email Notifications Section to Superadmin Tenant Form

**Files:**
- Modify: `src/components/superadmin/tenant-form.tsx`

**Step 1: Add email fields to formData state (line 27-76)**

Add these two fields to the `formData` useState object:

```typescript
    // Email notifications
    admin_email: tenant?.admin_email || '',
    email_notifications_enabled: tenant?.email_notifications_enabled ?? false,
```

**Step 2: Add email fields to the handleSubmit input object (line 81-130)**

Add:

```typescript
      // Email notifications
      admin_email: formData.admin_email || null,
      email_notifications_enabled: formData.email_notifications_enabled,
```

**Step 3: Add the Email Notifications card section to the form JSX**

Insert a new `<Card>` block after the "Messenger Integration" card (after line 500) and before the "Convex / Mobile App" card:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.email_notifications_enabled}
              onChange={(e) => setFormData({ ...formData, email_notifications_enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">Enable Email Notifications</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Send order notification emails to the restaurant via PostHog Workflows
          </p>

          <div className="space-y-2">
            <Label htmlFor="admin_email">Restaurant Email Address</Label>
            <Input
              id="admin_email"
              type="email"
              value={formData.admin_email}
              onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
              placeholder="restaurant@example.com"
              disabled={!formData.email_notifications_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Orders will be sent to this email address when a new order is placed
            </p>
          </div>
        </CardContent>
      </Card>
```

**Step 4: Verify it compiles and lint passes**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "tenant-form" | head -5`
Run: `npm run lint`

Expected: No errors.

**Step 5: Commit**

```bash
git add src/components/superadmin/tenant-form.tsx
git commit -m "feat: add Email Notifications section to superadmin tenant form"
```

---

### Task 7: Add Environment Variables

**Files:**
- Modify: `.env.local` (or `.env.example` if it exists)

**Step 1: Check for env example file**

Run: `ls -la .env*`

**Step 2: Add PostHog env vars**

Add to your `.env.local`:

```
# PostHog (email notifications)
POSTHOG_API_KEY=phc_your_project_api_key
POSTHOG_HOST=https://us.i.posthog.com
```

Do NOT add actual keys to `.env.example` — just add placeholder comments.

**Step 3: If validate-env.mjs exists, check if it needs updating**

Read `scripts/validate-env.mjs` — PostHog env vars should be OPTIONAL (the graceful degradation pattern means missing vars = no-op). Do NOT add them to required env validation.

**Step 4: Commit env example only (not .env.local)**

```bash
# Only commit .env.example if it was modified
git add .env.example 2>/dev/null || true
git commit -m "docs: add PostHog env var placeholders" --allow-empty
```

---

### Task 8: Final Verification

**Step 1: Run all tests**

Run: `npm test -- --verbose`

Expected: All tests pass, including the new posthog tests.

**Step 2: Run lint**

Run: `npm run lint`

Expected: No errors.

**Step 3: Verify dev server starts**

Run: `npm run dev` (manually check that the app starts without errors, then Ctrl+C)

**Step 4: Final commit if any cleanup needed**

---

## Post-Implementation: PostHog Dashboard Setup (Manual)

These steps are done in the PostHog web UI, not in code:

1. **Go to PostHog > Messaging > Channels** — add a new email channel
2. **Add 4 DNS records** shown in the setup window to verify your sending domain
3. **Go to PostHog > Workflows > New Workflow**
4. **Add trigger:** event = `order_created`
5. **Add email dispatch step:**
   - Sender: your verified email
   - Subject: `New Order #{{ event.properties.order_id }} — {{ event.properties.customer_name }}`
   - Body template: Use event properties for full order details
6. **Set frequency:** "Every time"
7. **Test:** Create a test order to verify email delivery
8. **Enable the workflow**
