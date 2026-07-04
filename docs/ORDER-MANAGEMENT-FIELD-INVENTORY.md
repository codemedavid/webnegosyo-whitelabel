# Order Management — Field Inventory (Design Handoff)

> Purpose: Complete inventory of every data field, status, and action that lives in the tenant
> admin **Order Management** experience, so the page can be redesigned in Claude Design.
> Covers both data backends, all screens, and every conditional field.

---

## 0. Context the designer needs

- **Audience:** Restaurant merchant (tenant admin), often on a phone behind the counter or on a
  tablet. Needs to triage new orders fast, read customer + delivery details at a glance, advance
  order status, and act on payment.
- **Two data backends, one feature set** (design should target the richer Convex version):
  - **Convex (full mode)** — real-time order queue. Used when the tenant has a
    `convex_deployment_url`. This is the primary, feature-complete experience.
    → List: `ConvexOrdersTab`, Detail: `ConvexOrderSheet` (right-side slide-over).
  - **Supabase (limited mode)** — polled/realtime fallback when no Convex is configured.
    Shows a "Limited Mode" info banner. → List: `OrderCard` grid, Detail: `OrderDetailDialog`
    (full-screen modal with tabs).
- **Currency:** Philippine Peso `₱`, 2 decimals.
- **Page header today:** `h1 "Orders"` + subtitle "Manage customer orders" + breadcrumb
  `Dashboard / Orders`.

---

## 1. Order Status Lifecycle (core to the whole design)

Single linear flow with a cancel escape hatch. Every screen renders it (badge, stepper, or pills).

| Status | Meaning | Next action label | Suggested color |
|--------|---------|-------------------|-----------------|
| `pending` | Just placed, needs merchant confirmation | "Confirm Order" | orange / yellow |
| `confirmed` | Accepted | "Start Preparing" | blue |
| `preparing` | Being made | "Mark Ready" | amber / purple |
| `ready` | Ready for pickup/handoff | "Mark Delivered" | green |
| `delivered` | Done (terminal) | — | gray / purple |
| `cancelled` | Cancelled (terminal) | — | red |

- **Advance button** shows the next-status label above.
- **Cancel** is available in `pending, confirmed, preparing, ready` (a destructive icon button).
- `delivered` and `cancelled` hide all action buttons.
- A **stepper** component (`OrderStatusStepper`) visualizes progress through the 5 non-cancelled states.

---

## 2. Payment Status (separate from order status)

Editable dropdown, independent of order lifecycle.

| Payment status | Suggested color |
|----------------|-----------------|
| `pending` | orange |
| `paid` | green |
| `verified` | blue |
| `failed` | red |

---

## 3. Order source & type badges

- **Source** (`source`): `web` (globe icon), `mobile` (smartphone icon), `qr_handoff`, `pos`.
  Rendered as a small badge/icon next to the customer.
- **Order type** (`orderType` / `order_type`, human-readable string): typically **Dine In**
  (utensils icon, green), **Pick Up** (package icon, blue), **Delivery** (truck icon, orange).
  Free-text per tenant, so design must tolerate arbitrary labels + a fallback (plain text badge).

---

## 4. THE FULL FIELD LIST

### 4a. Order header / identity
| Field | Source key (Convex / Supabase) | Notes |
|-------|-------------------------------|-------|
| Order ID (short) | `_id.slice(-6)` / `id.slice(0,8)` | Displayed as `Order #ABC123`, uppercased |
| Created at / time-ago | `_creationTime` / `created_at` | Both "5m ago" relative + absolute date-time |
| Status | `status` | see §1 |
| Source | `source` | see §3 |
| Order type | `orderType` / `order_type` | see §3 |
| Scheduled / pre-order time | `scheduledFor` / `scheduled_for` (+ `customer_data.scheduled_for_label`) | **Conditional.** Amber "Pre-order · Scheduled for {label}" banner. ASAP orders omit it. |

### 4b. Customer
| Field | Source key | Notes |
|-------|-----------|-------|
| Customer name | `customerName` / `customer_name` | |
| Customer contact (phone) | `customerContact` / `customer_contact` | Rendered as tappable `tel:` link |
| **Customer data bag** (dynamic) | `customerData` / `customer_data` | Free-form key/value from tenant's custom checkout fields. Rendered as a label/value list with `_` → space, capitalized. |

**Known `customerData` keys** (varies per tenant — design a flexible key/value list):
- `customer_name`, `customer_phone`, `customer_email`
- `delivery_address` (address — gets a map-pin icon)
- `delivery_lat`, `delivery_lng` — **hidden from display** (used for Lalamove only)
- `special_instructions`
- `scheduled_for`, `scheduled_for_label` — **hidden** (surfaced via the pre-order banner instead)
- `messenger_psid` — **hidden** (internal Messenger id)

> Design note: the display **filters out** `scheduled_for`, `scheduled_for_label`, `delivery_lat`,
> `delivery_lng`, `messenger_psid`, and any empty values.

### 4c. Items (line items)
Each order has an item list; header shows `Items (count)` where count = sum of quantities.

| Field | Source key | Notes |
|-------|-----------|-------|
| Quantity | `quantity` | Shown as `2x` badge |
| Item name | `menuItemName` / `menu_item_name` | |
| Variation (legacy flat) | `variation` | e.g. "Large" |
| Variation selections (grouped) | `variationSelections` | Array of `{typeName, optionName, priceAdjustment}` → "Size: Large, Spice: Hot" |
| Add-ons | `addons` | Array of `{name, price, quantity?}` → "+ Extra cheese, Bacon" |
| Special instructions | `specialInstructions` / `special_instructions` | Italic, quoted, amber |
| Line subtotal | `subtotal` | `₱` right-aligned |
| Unit price | `price` | |
| Bundle flag + name | `isBundleItem`, `bundleName`, `slotName` | **Conditional** outline badge "Bundle - Slot" |
| Upsell flag | `isUpsellItem` | Marks item as added via upsell |

### 4d. Pricing / totals
| Field | Source key | Notes |
|-------|-----------|-------|
| Subtotal | derived (`total − delivery_fee − service_charge`) | Supabase dialog computes it |
| Delivery fee | `deliveryFee` / `delivery_fee` | **Conditional**, shown when > 0 |
| Service charge | `service_charge_amount` (Supabase) | Present in data model; **not currently surfaced** in UI — candidate to add |
| **Total** | `total` | Bold, the hero number |

### 4e. Payment
| Field | Source key | Notes |
|-------|-----------|-------|
| Payment method name | `paymentMethod` / `payment_method_name` | e.g. "GCash", "Cash" |
| Payment method details | `paymentMethodDetails` / `payment_method_details` | e.g. account number/instructions |
| Payment method QR | `payment_method_qr_code_url` (Supabase) | In data model; **not surfaced** in admin detail |
| Payment status | `paymentStatus` / `payment_status` | Editable dropdown, see §2 |
| **Payment proof — screenshot** | `payment_proof_url` | ⚠️ Captured at checkout, **NOT shown anywhere in admin today.** Key gap — merchant should see the uploaded proof image. |
| **Payment proof — reference #** | `payment_proof_reference` | ⚠️ Same — not surfaced |
| Payment proof uploaded at | `payment_proof_uploaded_at` | ⚠️ Not surfaced |
| (internal) proof public id | `payment_proof_public_id` | Cloudinary id, internal |

### 4f. Delivery (Lalamove) — **conditional section, only when delivery**
Shown when `deliveryAddress` (Convex) or `lalamove_quotation_id`/`delivery_fee` (Supabase) exist.

| Field | Source key | Notes |
|-------|-----------|-------|
| Delivery address | `deliveryAddress` / `customer_data.delivery_address` | Map-pin icon |
| Delivery coordinates | `deliveryLatitude/Longitude` / `delivery_lat`/`delivery_lng` | Internal, for booking; not displayed |
| Lalamove quotation id | `lalamoveQuotationId` / `lalamove_quotation_id` | Presence = quote exists |
| Lalamove order id | `lalamoveOrderId` / `lalamove_order_id` | Absent = "Order not created yet" |
| Lalamove status | `lalamoveStatus` / `lalamove_status` | e.g. ASSIGNING, ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED — each color-coded |
| **Driver name** | `lalamoveDriverName` / `lalamove_driver_name` | |
| **Driver phone** | `lalamoveDriverPhone` / `lalamove_driver_phone` | tappable `tel:` link |
| Driver id | `lalamove_driver_id` (Supabase) | internal |
| **Tracking URL** | `lalamoveTrackingUrl` / `lalamove_tracking_url` | "Track Delivery" external link |

> The Supabase path has a richer `LalamoveDeliveryPanel` (book/quote/track/cancel actions) in a
> dedicated "Delivery" tab. Design should include a delivery action area, not just read-only fields.

---

## 5. Screen-by-screen structure (current)

### List view
- **Filter pills / tabs:** All, Pending, Confirmed, Preparing, Ready, Delivered, Cancelled.
- **Row / card per order** shows: customer name, source icon, contact, time-ago, order type,
  scheduled badge (if any), total, item count, status badge. Click → detail.
- **States:** loading spinner, empty ("No orders found" + package icon), populated.
- **Supabase adds:** pagination (20/page), "Limited Mode" info banner.

### Detail view
Convex = right slide-over `Sheet`; Supabase = large modal with **4 tabs** (Details, Items,
Customer, Delivery). Sections in the detail:
1. Header: order #, created date, status badge, source, order-type badge.
2. Status stepper + **advance / cancel** action buttons.
3. Pre-order banner (conditional).
4. **Items** card (line items + delivery fee + total).
5. **Customer** card (name, phone, dynamic data bag).
6. **Delivery** card (conditional, Lalamove details).
7. **Payment** card (method, details, editable payment-status dropdown).

---

## 6. Gaps / opportunities to flag in the redesign

1. **Payment proof is invisible to merchants.** `payment_proof_url` (screenshot) and
   `payment_proof_reference` are captured at checkout but rendered nowhere in admin. High-value add.
2. **Service charge** (`service_charge_amount`) is stored but never shown in the totals breakdown.
3. **Payment section is missing entirely** from the Supabase (limited-mode) detail dialog — only
   Convex shows payment. Parity gap.
4. **Payment method QR** is stored but not shown to the merchant.
5. Two divergent detail layouts (slide-over vs tabbed modal) — a unified design would help.

---

## 7. Quick copy-paste field checklist for Claude Design

**Identity:** order # · created time (relative + absolute) · status · source · order type · scheduled/pre-order time
**Customer:** name · phone (tel link) · dynamic custom fields (email, address, notes, …)
**Items:** qty · name · variation · variation groups · add-ons · special instructions · unit price · subtotal · bundle badge · upsell flag
**Totals:** subtotal · delivery fee · service charge · **total**
**Payment:** method name · method details · payment status (editable) · **payment proof screenshot** · **payment reference #** · uploaded-at
**Delivery (Lalamove, conditional):** delivery address · lalamove status · **driver name** · **driver phone (tel)** · tracking URL · quotation/order state
**Actions:** advance status · cancel order · change payment status · (delivery) book/track/cancel
