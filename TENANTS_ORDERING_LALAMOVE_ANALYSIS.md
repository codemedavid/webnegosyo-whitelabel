# Comprehensive Analysis: Tenants, Ordering & Lalamove

## 📊 Executive Summary

This document provides a complete analysis of the three interconnected systems that power the multi-tenant restaurant ordering platform:

1. **Tenant Architecture** - Multi-restaurant isolation and customization
2. **Order Management** - Customer ordering workflow and admin processing
3. **Lalamove Integration** - Third-party delivery service integration

---

## 1️⃣ Tenant Architecture

### Overview
Each restaurant operates as an independent tenant with isolated data, custom branding, and configurable features.

### Database Schema

**Table: `tenants`**
```sql
-- Core Identity
id                      UUID PRIMARY KEY
name                    TEXT NOT NULL              -- Display name
slug                    TEXT UNIQUE NOT NULL       -- URL identifier (e.g., "bella-italia")
domain                  TEXT                       -- Custom domain (optional)
is_active               BOOLEAN DEFAULT true

-- Branding Configuration
logo_url                TEXT
primary_color           TEXT
secondary_color         TEXT
accent_color            TEXT
background_color        TEXT
header_color            TEXT
header_font_color       TEXT
cards_color             TEXT
cards_border_color      TEXT
card_title_color        TEXT
hero_title              TEXT
hero_description        TEXT
hero_title_color        TEXT
hero_description_color  TEXT

-- Messenger Integration
messenger_page_id       TEXT
messenger_username      TEXT

-- Feature Toggles
mapbox_enabled          BOOLEAN DEFAULT false
enable_order_management BOOLEAN DEFAULT true

-- Restaurant Location (for delivery pickup)
restaurant_address      TEXT
restaurant_latitude     NUMERIC(10,8)
restaurant_longitude    NUMERIC(11,8)

-- Lalamove Configuration
lalamove_enabled        BOOLEAN DEFAULT false
lalamove_api_key        TEXT
lalamove_secret_key     TEXT
lalamove_market         TEXT                       -- HK, SG, TH, PH, etc.
lalamove_service_type   TEXT                       -- MOTORCYCLE, VAN, CAR
lalamove_sandbox        BOOLEAN DEFAULT true

-- Timestamps
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ
```

### Key Features

#### 1. **Multi-Tenancy Isolation**
- Each tenant has:
  - Unique slug for URL routing (`/bella-italia/menu`)
  - Optional custom domain support
  - Isolated menu items, categories, and orders
  - Independent branding and configuration

#### 2. **Routing Strategy**
```typescript
// URL structure: /{tenant-slug}/{page}
// Examples:
- /bella-italia/menu          → Customer menu
- /bella-italia/checkout      → Customer checkout
- /bella-italia/admin         → Admin dashboard
- /bella-italia/admin/orders  → Order management
```

#### 3. **Branding System**
Each tenant can customize:
- **Visual Identity**: Logo, colors (primary, secondary, accent)
- **Page Elements**: Header, cards, backgrounds, borders
- **Hero Section**: Custom title, description, and colors
- **Font Colors**: Independent control for all text elements

#### 4. **Feature Control**
Tenants can enable/disable:
- **Mapbox Integration**: Address autocomplete in checkout
- **Order Management**: Database storage vs. Messenger-only
- **Lalamove Delivery**: Third-party delivery service

#### 5. **Admin Access Control**
```typescript
// app_users table links auth.users to tenants
interface AppUser {
  user_id: string         // References auth.users
  role: 'superadmin' | 'admin'
  tenant_id?: string      // NULL for superadmin, set for tenant admin
}

// Row Level Security (RLS) enforces access:
// - Superadmins: Access all tenants
// - Tenant Admins: Access only their tenant's data
```

### Service Layer

**File: `src/lib/tenants-service.ts`**

Key functions:
```typescript
// Client-side functions (browser context)
getTenantBySlugSupabase(slug: string)
getTenantByIdSupabase(id: string)
listTenantsSupabase()

// Validation schema
tenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9\-]+$/),
  // ... all tenant fields with validation
})
```

### UI Management

**Superadmin Portal:**
- Create/edit/delete tenants
- Configure all branding and features
- Manage Lalamove credentials
- Set restaurant location for delivery

**Tenant Admin Portal:**
- Update branding colors only (RLS-restricted)
- Cannot modify core settings
- Settings page: `/[tenant]/admin/settings`

---

## 2️⃣ Order Management System

### Overview
Flexible ordering system supporting multiple order types (dine-in, pickup, delivery) with customizable customer forms and payment methods.

### Database Schema

**Table: `orders`**
```sql
-- Core Order Info
id                       UUID PRIMARY KEY
tenant_id                UUID NOT NULL REFERENCES tenants
order_type_id            UUID REFERENCES order_types
customer_name            TEXT
customer_contact         TEXT
customer_data            JSONB                     -- Dynamic form data
total                    NUMERIC(10,2)
status                   TEXT DEFAULT 'pending'    -- pending, confirmed, preparing, ready, delivered, cancelled

-- Lalamove Fields
delivery_fee             NUMERIC(10,2)
lalamove_quotation_id    TEXT
lalamove_order_id        TEXT
lalamove_status          TEXT
lalamove_driver_id       TEXT
lalamove_driver_name     TEXT
lalamove_driver_phone    TEXT
lalamove_tracking_url    TEXT

-- Payment Fields
payment_method_id        UUID
payment_method_name      TEXT
payment_method_details   TEXT
payment_method_qr_code_url TEXT
payment_status           TEXT                      -- pending, paid, failed, verified

-- Timestamps
created_at               TIMESTAMPTZ
updated_at               TIMESTAMPTZ
```

**Table: `order_items`**
```sql
id                       UUID PRIMARY KEY
order_id                 UUID NOT NULL REFERENCES orders
menu_item_id             UUID REFERENCES menu_items
menu_item_name           TEXT NOT NULL
variation                TEXT                      -- Size, etc.
addons                   TEXT[]                    -- Extra cheese, etc.
quantity                 INTEGER NOT NULL
price                    NUMERIC(10,2)
subtotal                 NUMERIC(10,2)
special_instructions     TEXT
```

**Table: `order_types`**
```sql
id                       UUID PRIMARY KEY
tenant_id                UUID NOT NULL REFERENCES tenants
type                     TEXT NOT NULL             -- dine_in, pickup, delivery
name                     TEXT NOT NULL             -- Display name
description              TEXT
is_enabled               BOOLEAN DEFAULT true
order_index              INTEGER                   -- Display order
```

**Table: `customer_form_fields`**
```sql
id                       UUID PRIMARY KEY
tenant_id                UUID NOT NULL
order_type_id            UUID NOT NULL REFERENCES order_types
field_name               TEXT NOT NULL             -- Database key
field_label              TEXT NOT NULL             -- Display label
field_type               TEXT NOT NULL             -- text, email, phone, textarea, select, number
is_required              BOOLEAN DEFAULT false
placeholder              TEXT
validation_rules         JSONB
options                  TEXT[]                    -- For select fields
order_index              INTEGER
```

**Table: `payment_methods`**
```sql
id                       UUID PRIMARY KEY
tenant_id                UUID NOT NULL
name                     TEXT NOT NULL             -- e.g., "GCash"
details                  TEXT                      -- Payment instructions
qr_code_url              TEXT                      -- QR code for scanning
is_active                BOOLEAN DEFAULT true
order_index              INTEGER

-- Junction table for payment_methods <-> order_types
payment_method_order_types (payment_method_id, order_type_id)
```

### Order Flow

#### 1. **Customer Journey**

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Browse Menu                                                  │
│    - View items by category                                     │
│    - Search functionality                                       │
│    - Select items with variations/addons                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Add to Cart                                                  │
│    - Select variations (size, flavor, etc.)                     │
│    - Choose addons (extra cheese, etc.)                         │
│    - Add special instructions                                   │
│    - Real-time subtotal calculation                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Checkout                                                     │
│    - Select order type (dine-in/pickup/delivery)                │
│    - Fill dynamic customer form                                 │
│    - If delivery + Lalamove: Get delivery fee                   │
│    - Select payment method                                      │
│    - Review order summary                                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Order Submission                                             │
│    - If order management enabled: Save to database              │
│    - Generate formatted message                                 │
│    - Redirect to Messenger (or show confirmation)               │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. **Admin Order Management**

```
┌─────────────────────────────────────────────────────────────────┐
│ Orders Dashboard                                                │
│ - View all orders with filters (status, type, date)            │
│ - Real-time stats (today's revenue, order count)               │
│ - Pagination support                                            │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Order Details                                                   │
│ - View full order information                                   │
│ - Customer details and contact                                  │
│ - Itemized list with variations/addons                          │
│ - Payment method and status                                     │
│ - Lalamove tracking (if applicable)                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Order Status Updates                                            │
│ - Change status: pending → confirmed → preparing → ready        │
│ - Automatic Lalamove dispatch on "confirmed"                    │
│ - Cancel orders                                                 │
│ - Track delivery driver                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Service Layer

**File: `src/lib/orders-service.ts`**

```typescript
// Core order operations
createOrder(
  tenantId: string,
  items: OrderItem[],
  total: number,
  customerInfo?: { name, contact },
  orderTypeId?: string,
  customerData?: Record<string, unknown>,
  deliveryFee?: number,
  lalamoveQuotationId?: string,
  paymentMethodId?: string
) => Promise<Order>

getOrdersByTenant(
  tenantId: string,
  params?: { page, limit, status, orderType, startDate, endDate }
) => Promise<PaginatedOrdersResult>

getOrderById(orderId: string, tenantId: string) => Promise<OrderWithItems>

updateOrderStatus(
  orderId: string,
  tenantId: string,
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
) => Promise<Order>
// 🔥 Auto-creates Lalamove order when status changes to "confirmed"

getOrderStats(tenantId: string) => Promise<OrderStats>
```

### Order Types Configuration

Each order type defines:
1. **Type**: `dine_in`, `pickup`, or `delivery`
2. **Display Name**: "Dine In", "Take Out", "Home Delivery", etc.
3. **Custom Form Fields**: Dynamic fields specific to order type
4. **Payment Methods**: Which payment options are available

Example:
```typescript
// Delivery Order Type
{
  type: 'delivery',
  name: 'Home Delivery',
  fields: [
    { field_name: 'delivery_address', type: 'text', required: true },
    { field_name: 'delivery_instructions', type: 'textarea', required: false }
  ],
  payment_methods: ['cash_on_delivery', 'gcash', 'paymaya']
}

// Dine-in Order Type
{
  type: 'dine_in',
  name: 'Dine In',
  fields: [
    { field_name: 'table_number', type: 'number', required: true },
    { field_name: 'number_of_guests', type: 'number', required: false }
  ],
  payment_methods: ['cash', 'card']
}
```

### Cart Management

**Context: `src/hooks/useCart.ts`**

```typescript
interface CartItem {
  id: string                    // Unique cart item ID
  menu_item: MenuItem
  selected_variations?: { [typeId: string]: VariationOption }
  selected_addons: Addon[]
  quantity: number
  special_instructions?: string
  subtotal: number
}

// Cart operations
addToCart(item: CartItem)
updateQuantity(itemId: string, quantity: number)
removeFromCart(itemId: string)
clearCart()
setOrderType(orderType: string)
```

---

## 3️⃣ Lalamove Delivery Integration

### Overview
Full integration with Lalamove's API for on-demand delivery service, supporting real-time quotations and automatic order dispatch.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Customer Checkout                                               │
│ - Enters delivery address (Mapbox autocomplete)                 │
│ - System fetches coordinates                                    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Quotation Phase (src/app/actions/lalamove.ts)                  │
│ - createQuotationAction()                                       │
│ - Sends: pickup location, delivery location, service type       │
│ - Returns: quotation ID, price, expiry time                     │
│ - Display delivery fee to customer                              │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Order Creation                                                  │
│ - Customer completes checkout                                   │
│ - Order saved with quotation ID                                 │
│ - Delivery fee included in total                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Admin Confirms Order                                            │
│ - Admin changes status to "confirmed"                           │
│ - System automatically creates Lalamove order                   │
│ - Driver assigned, tracking URL generated                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Delivery Tracking                                               │
│ - Real-time driver status updates                               │
│ - Driver info (name, phone)                                     │
│ - Tracking URL for customer                                     │
│ - Status: ASSIGNING → ON_GOING → COMPLETED                     │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration

#### Tenant Setup

**Required Fields:**
```typescript
lalamove_enabled: boolean         // Master toggle
lalamove_api_key: string          // Public API key from Lalamove dashboard
lalamove_secret_key: string       // Secret key from Lalamove dashboard
lalamove_market: string           // HK, SG, TH, PH, MY, VN, TW
lalamove_service_type: string     // MOTORCYCLE, VAN, CAR, WALK
lalamove_sandbox: boolean         // true = test mode, false = production

// Restaurant pickup location
restaurant_address: string
restaurant_latitude: number
restaurant_longitude: number
```

**Markets & Service Types:**

| Market | Code | Available Service Types |
|--------|------|------------------------|
| Hong Kong | HK | MOTORCYCLE, VAN, SEDAN, MPV |
| Singapore | SG | MOTORCYCLE, VAN, SEDAN |
| Thailand | TH | MOTORCYCLE, CAR, MPV, VAN |
| Philippines | PH | MOTORCYCLE, CAR, MPV, SEDAN, VAN |
| Malaysia | MY | MOTORCYCLE, VAN |
| Vietnam | VN | MOTORCYCLE |
| Taiwan | TW | MOTORCYCLE, SEDAN, VAN |

### API Integration

**File: `src/lib/lalamove-service.ts`**

Uses official SDK: `@lalamove/lalamove-js`

#### 1. Create Quotation

```typescript
createLalamoveQuotation(
  tenant: Tenant,
  pickupAddress: string,
  pickupCoordinates: { lat, lng },
  deliveryAddress: string,
  deliveryCoordinates: { lat, lng },
  serviceType?: string
) => Promise<{
  quotationId: string
  price: number
  currency: string
  expiresAt: Date        // Valid for ~5 minutes
  distance: string
  duration: string
}>
```

**Flow:**
1. Build stops array (pickup + delivery)
2. Create quotation payload with SDK builder
3. Call Lalamove API
4. Return price and quotation ID

**Example:**
```typescript
const quotation = await createLalamoveQuotation(
  tenant,
  "123 Restaurant St, Manila",
  { lat: 14.5995, lng: 120.9842 },
  "456 Customer Ave, Manila",
  { lat: 14.6091, lng: 120.9822 },
  "MOTORCYCLE"
)

// Returns:
{
  quotationId: "QT-123456789",
  price: 85.00,
  currency: "PHP",
  expiresAt: "2025-11-09T15:35:00Z"
}
```

#### 2. Create Lalamove Order

```typescript
createLalamoveOrder(
  tenant: Tenant,
  quotationId: string,
  senderName: string,
  senderPhone: string,        // E.164 format: +639171234567
  recipientName: string,
  recipientPhone: string,
  metadata?: Record<string, unknown>
) => Promise<{
  orderId: string
  status: string             // ASSIGNING_DRIVER, ON_GOING, etc.
  shareLink: string          // Tracking URL
  driverId?: string
}>
```

**Auto-Trigger Logic:**
- Located in `updateOrderStatus()` in `orders-service.ts`
- Triggered when status changes to "confirmed"
- Only if order has `lalamove_quotation_id` and no `lalamove_order_id`
- Race condition protection: double-check database before creating

```typescript
// Automatic Lalamove order creation
if (status === 'confirmed' && order.lalamove_quotation_id && !order.lalamove_order_id) {
  // Async, non-blocking
  createLalamoveOrderAction(
    tenantId,
    orderId,
    order.lalamove_quotation_id,
    restaurantName,
    restaurantPhone,
    customerName,
    customerPhone,
    metadata
  )
}
```

#### 3. Additional Operations

```typescript
// Get order details and update database
getLalamoveOrder(tenant: Tenant, orderId: string)

// Get driver information
getLalamoveDriver(tenant: Tenant, orderId: string, driverId: string)

// Cancel delivery
cancelLalamoveOrder(tenant: Tenant, orderId: string)

// Sync order status
syncLalamoveOrderAction(tenantId, orderId, lalamoveOrderId)
```

### Checkout Integration

**File: `src/app/[tenant]/checkout/page.tsx`**

#### Real-time Delivery Fee Calculation

```typescript
// State management
const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
const [quotationId, setQuotationId] = useState<string | null>(null)
const [isFetchingDeliveryFee, setIsFetchingDeliveryFee] = useState(false)
const [deliveryFeeAddress, setDeliveryFeeAddress] = useState<string>('')

// Auto-fetch when address changes
useEffect(() => {
  if (orderType === 'delivery' && deliveryAddress && coordinates) {
    fetchDeliveryFee(deliveryAddress, coordinates)
  }
}, [deliveryAddress, coordinates])

// Fetch quotation
async function fetchDeliveryFee(address: string, coords: { lat, lng }) {
  setIsFetchingDeliveryFee(true)
  
  const result = await createQuotationAction(
    tenant.id,
    tenant.restaurant_address,
    tenant.restaurant_latitude,
    tenant.restaurant_longitude,
    address,
    coords.lat,
    coords.lng,
    tenant.lalamove_service_type
  )
  
  if (result.success) {
    setDeliveryFee(result.data.price)
    setQuotationId(result.data.quotationId)
    setDeliveryFeeAddress(address)
  }
  
  setIsFetchingDeliveryFee(false)
}
```

#### Order Submission with Lalamove

```typescript
// Include delivery fee in order
const finalTotal = total + (deliveryFee || 0)

await createOrderAction(
  tenant.id,
  orderItems,
  {
    name: customerData.name,
    contact: customerData.contact
  },
  selectedOrderTypeId,
  customerData,
  deliveryFee,           // ← Delivery fee
  quotationId,           // ← Quotation ID for later dispatch
  paymentMethodId,
  paymentMethodName,
  paymentDetails,
  qrCodeUrl
)
```

### Admin UI Components

**File: `src/components/admin/lalamove-delivery-panel.tsx`**

Displays in order detail view:
- Delivery fee
- Quotation ID
- Lalamove order ID (if created)
- Current delivery status
- Driver information (name, phone)
- Tracking URL link
- Actions:
  - Create Lalamove order (if not created)
  - Sync status
  - Cancel delivery

### Phone Number Normalization

Lalamove requires E.164 format. System auto-formats:

```typescript
// Philippines example
"09171234567"      → "+639171234567"
"9171234567"       → "+639171234567"
"639171234567"     → "+639171234567"
"+639171234567"    → "+639171234567" (already correct)
```

### Error Handling

```typescript
// Quotation expiry check
checkQuotationValidity(tenantId, quotationId)
// - Quotations expire after ~5 minutes
// - System prevents using expired quotations in production
// - Sandbox mode: more lenient, lets API validate

// Race condition prevention
// - Check for existing lalamove_order_id before creating
// - Use database constraints to prevent duplicates
// - Log warnings if order already exists

// Graceful degradation
// - If Lalamove fails, order still processes
// - Admin can manually create Lalamove order later
// - Customer experience not blocked
```

### Environment Modes

#### Sandbox Mode (Testing)
- Use sandbox API keys
- Set `lalamove_sandbox = true`
- Test with sample addresses
- No real drivers dispatched
- Free testing

#### Production Mode
- Use production API keys
- Set `lalamove_sandbox = false`
- Real drivers dispatched
- Real charges applied
- Full service

---

## 🔗 Integration Points

### How Systems Connect

```
┌─────────────────────────────────────────────────────────────────┐
│ TENANT                                                          │
│ - Restaurant identity                                           │
│ - Branding & configuration                                      │
│ - Feature toggles                                               │
│ - Lalamove credentials                                          │
│ - Restaurant location                                           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ tenant_id FK
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ ORDER TYPES                                                     │
│ - Dine-in, Pickup, Delivery                                     │
│ - Custom form fields per type                                   │
│ - Payment method associations                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ order_type_id FK
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ ORDERS                                                          │
│ - Customer information                                          │
│ - Order items & pricing                                         │
│ - Order type & custom data                                      │
│ - Payment information                                           │
│ - Lalamove quotation & order IDs                                │
│ - Delivery fee                                                  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ If delivery & Lalamove enabled
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ LALAMOVE SERVICE                                                │
│ - Quotation API                                                 │
│ - Order dispatch                                                │
│ - Driver tracking                                               │
│ - Real-time status updates                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Example

**Complete Delivery Order Flow:**

1. **Tenant Configuration** (One-time setup)
   - Superadmin configures tenant Lalamove settings
   - Restaurant address and coordinates set
   - API credentials stored
   - Feature enabled

2. **Customer Places Order**
   - Selects items → cart
   - Chooses "Delivery" order type
   - Enters delivery address (Mapbox autocomplete)
   - System fetches Lalamove quotation
   - Delivery fee displayed: ₱85.00
   - Customer confirms order

3. **Order Created in Database**
   ```sql
   INSERT INTO orders (
     tenant_id,
     order_type_id,
     customer_name,
     customer_contact,
     customer_data,
     total,
     delivery_fee,
     lalamove_quotation_id,
     status
   ) VALUES (
     'tenant-uuid',
     'delivery-order-type-uuid',
     'Juan Dela Cruz',
     '+639171234567',
     '{"delivery_address": "456 Customer Ave, Manila", ...}',
     585.00,      -- Subtotal: 500 + Delivery: 85
     85.00,
     'QT-123456789',
     'pending'
   )
   ```

4. **Admin Confirms Order**
   - Admin sees order in dashboard
   - Changes status from "pending" → "confirmed"
   - System automatically:
     - Calls `createLalamoveOrderAction()`
     - Creates Lalamove delivery order
     - Updates order with Lalamove details:
       ```sql
       UPDATE orders SET
         lalamove_order_id = 'LO-987654321',
         lalamove_status = 'ASSIGNING_DRIVER',
         lalamove_tracking_url = 'https://track.lalamove.com/...'
       WHERE id = 'order-uuid'
       ```

5. **Delivery Tracking**
   - Driver assigned by Lalamove
   - Status updates: ASSIGNING → ON_GOING → COMPLETED
   - Admin can view driver info
   - Customer receives tracking link

6. **Order Completed**
   - Driver delivers food
   - Lalamove status: COMPLETED
   - Admin marks order: delivered
   - Workflow complete

---

## 📈 Key Metrics & Stats

### Order Statistics

**Dashboard displays:**
- Today's revenue
- Order count by status
- Recent orders
- Popular items
- Order type distribution
- Average order value
- Delivery vs. pickup vs. dine-in ratios

**Service layer:**
```typescript
getOrderStats(tenantId: string) => {
  totalRevenue: number
  totalOrders: number
  pendingOrders: number
  confirmedOrders: number
  preparingOrders: number
  readyOrders: number
  deliveredOrders: number
  cancelledOrders: number
  todayRevenue: number
  todayOrders: number
}
```

---

## 🔐 Security Considerations

### Row Level Security (RLS)

**Tenants Table:**
```sql
-- Public can read active tenants
CREATE POLICY tenants_read_active ON tenants
  FOR SELECT USING (is_active = true);

-- Only superadmins can create
CREATE POLICY tenants_insert ON tenants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE user_id = auth.uid()
      AND role = 'superadmin'
    )
  );

-- Superadmins can update all, tenant admins can update branding only
CREATE POLICY tenants_admin_update ON tenants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE user_id = auth.uid()
      AND (role = 'superadmin' OR (role = 'admin' AND tenant_id = tenants.id))
    )
  );
```

**Orders Table:**
```sql
-- Public can insert orders (customer checkout)
CREATE POLICY orders_public_insert ON orders
  FOR INSERT WITH CHECK (true);

-- Only tenant admins can view their orders
CREATE POLICY orders_tenant_admin_read ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE user_id = auth.uid()
      AND (role = 'superadmin' OR (role = 'admin' AND tenant_id = orders.tenant_id))
    )
  );
```

### API Key Protection

- Lalamove keys stored in database (encrypted at rest by Supabase)
- Never exposed to client-side code
- Server actions (`'use server'`) handle all Lalamove API calls
- Environment separation (sandbox vs production)

---

## 🧪 Testing Guide

### Tenant Setup
```bash
# 1. Create tenant via superadmin UI
# 2. Configure branding
# 3. Set up order types
# 4. Add payment methods
# 5. If using Lalamove:
#    - Add restaurant address
#    - Configure Lalamove settings (use sandbox)
#    - Enable Lalamove delivery
```

### Order Flow Testing
```bash
# 1. Customer Journey
Visit: /[tenant-slug]/menu
- Add items to cart
- Go to checkout
- Select order type
- Fill form
- Submit order

# 2. Admin Journey
Visit: /[tenant-slug]/admin/orders
- View new order
- Check order details
- Update status
- Track delivery (if Lalamove)
```

### Lalamove Testing (Sandbox)
```bash
# Prerequisites
- Lalamove sandbox account
- Sandbox API keys configured
- Restaurant address set
- lalamove_sandbox = true

# Test Flow
1. Customer enters delivery address
2. System fetches quotation
3. Verify delivery fee displayed
4. Complete checkout
5. Admin confirms order
6. Check Lalamove order created
7. View tracking URL
```

---

## 🚀 Deployment Checklist

### Database
- [ ] Apply all migrations (0001-0010)
- [ ] Verify RLS policies active
- [ ] Test tenant creation
- [ ] Confirm order creation works

### Environment Variables
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Mapbox (optional)
NEXT_PUBLIC_MAPBOX_TOKEN=

# Platform domain
PLATFORM_ROOT_DOMAIN=yourdomain.com
```

### Feature Configuration
- [ ] Create initial tenant(s)
- [ ] Configure branding
- [ ] Set up order types
- [ ] Add payment methods
- [ ] Configure Lalamove (if needed)
- [ ] Test checkout flow
- [ ] Verify admin access

### Lalamove Production Setup
- [ ] Get production API keys
- [ ] Set lalamove_sandbox = false
- [ ] Test with real addresses
- [ ] Verify driver dispatch
- [ ] Confirm tracking works

---

## 📚 File Reference

### Core Services
- `src/lib/tenants-service.ts` - Tenant operations
- `src/lib/orders-service.ts` - Order operations
- `src/lib/lalamove-service.ts` - Lalamove API integration
- `src/lib/order-types-service.ts` - Order type configuration
- `src/lib/admin-service.ts` - Admin authorization

### Server Actions
- `src/actions/tenants.ts` - Tenant CRUD
- `src/app/actions/orders.ts` - Order CRUD
- `src/app/actions/lalamove.ts` - Lalamove operations
- `src/app/actions/order-types.ts` - Order type management

### UI Components
- `src/components/admin/orders-list.tsx` - Order listing
- `src/components/admin/order-detail-dialog.tsx` - Order details
- `src/components/admin/lalamove-delivery-panel.tsx` - Lalamove tracking
- `src/components/superadmin/tenant-form-wrapper.tsx` - Tenant management
- `src/app/[tenant]/checkout/page.tsx` - Customer checkout

### Database Migrations
- `supabase/migrations/0001_initial.sql` - Core schema
- `supabase/migrations/0009_order_types.sql` - Order types system
- `supabase/migrations/0010_lalamove_delivery.sql` - Lalamove fields

---

## 🎯 Summary

The platform successfully integrates three major systems:

1. **Tenant Architecture**: Multi-restaurant support with complete isolation, custom branding, and flexible feature controls

2. **Order Management**: Sophisticated ordering system with customizable order types, dynamic forms, payment methods, and real-time admin management

3. **Lalamove Integration**: Seamless third-party delivery integration with automatic quotations, driver dispatch, and order tracking

All systems work together to provide a complete restaurant ordering solution that scales from a single restaurant to multiple tenants, with optional delivery service integration.

---

*Generated: November 9, 2025*
*Platform: Next.js 15 + Supabase + Lalamove*

