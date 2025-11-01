# Order Types and Configuration Analysis

## Overview

The system implements a comprehensive order types configuration system that allows tenants to configure different order fulfillment methods (dine-in, pickup, delivery) with customizable customer information forms.

## Database Schema

### `order_types` Table

Located in migration: `supabase/migrations/0009_order_types.sql`

**Structure:**
- `id` (uuid, PK)
- `tenant_id` (uuid, FK → tenants)
- `type` (text, enum: 'dine_in' | 'pickup' | 'delivery')
- `name` (text) - Display name (e.g., "Dine In", "Pick Up", "Delivery")
- `description` (text, optional) - User-facing description
- `is_enabled` (boolean, default: true)
- `order_index` (integer, default: 0) - Display order
- `created_at`, `updated_at` (timestamptz)

**Constraints:**
- Unique constraint: `(tenant_id, type)` - Each tenant can have only one of each type
- Check constraint on `type` field

**Indexes:**
- `order_types_tenant_idx` on `tenant_id`
- `order_types_enabled_idx` on `(tenant_id, is_enabled)`

**Default Data:**
- Migration automatically creates three default order types for all existing tenants:
  1. **Dine In** (order_index: 0) - "Enjoy your meal at our restaurant"
  2. **Pick Up** (order_index: 1) - "Order ahead and pick up at our location"
  3. **Delivery** (order_index: 2) - "Get your order delivered to your door"

### `customer_form_fields` Table

**Structure:**
- `id` (uuid, PK)
- `tenant_id` (uuid, FK → tenants)
- `order_type_id` (uuid, FK → order_types, CASCADE DELETE)
- `field_name` (text) - Internal identifier (e.g., 'customer_name', 'customer_phone', 'delivery_address', 'table_number')
- `field_label` (text) - Display label (e.g., "Full Name", "Phone Number")
- `field_type` (text, enum: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number')
- `is_required` (boolean, default: false)
- `placeholder` (text, optional)
- `validation_rules` (jsonb, default: {}) - Additional validation rules
- `options` (jsonb, default: []) - For select field types
- `order_index` (integer, default: 0) - Display order within form
- `created_at`, `updated_at` (timestamptz)

**Default Form Fields (per order type):**

**Dine In:**
- `customer_name` (text, optional) - "Full Name"
- `table_number` (text, optional) - "Table Number"

**Pick Up:**
- `customer_name` (text, required) - "Full Name"
- `customer_phone` (phone, required) - "Phone Number"

**Delivery:**
- `customer_name` (text, required) - "Full Name"
- `customer_phone` (phone, required) - "Phone Number"
- `delivery_address` (textarea, required) - "Delivery Address"

### `orders` Table Extensions

The orders table has been extended to support order types:
- `order_type_id` (uuid, FK → order_types) - Reference to order type
- `order_type` (text) - Denormalized name for easier queries
- `customer_data` (jsonb, default: {}) - Stores dynamic customer form data

**Indexes:**
- `orders_order_type_idx` on `order_type_id`
- `orders_order_type_text_idx` on `(tenant_id, order_type)`

## Row Level Security (RLS)

### Order Types Policies

1. **Public Read (Enabled Only):**
   - `order_types_read_active`: Users can read enabled order types for active tenants

2. **Admin Write:**
   - `order_types_write_admin`: Only superadmin or tenant admin can create/update/delete order types

### Customer Form Fields Policies

1. **Public Read (Active Only):**
   - `customer_form_fields_read_active`: Users can read form fields for enabled order types of active tenants

2. **Admin Write:**
   - `customer_form_fields_write_admin`: Only superadmin or tenant admin can manage form fields

## Server-Side Services

### `src/lib/order-types-service.ts`

**Order Types Operations:**
- `getOrderTypesByTenant(tenantId)` - Get all order types (enabled + disabled)
- `getEnabledOrderTypesByTenant(tenantId)` - Get only enabled order types
- `getOrderTypeById(orderTypeId, tenantId)` - Get single order type with admin verification
- `createOrderType(tenantId, input)` - Create new order type
- `updateOrderType(orderTypeId, tenantId, input)` - Update existing order type
- `deleteOrderType(orderTypeId, tenantId)` - Delete order type (cascades to form fields)
- `toggleOrderTypeEnabled(orderTypeId, tenantId, enabled)` - Toggle enable/disable

**Customer Form Fields Operations:**
- `getCustomerFormFieldsByOrderType(orderTypeId, tenantId)` - Get all form fields for an order type
- `getCustomerFormFieldById(fieldId, tenantId)` - Get single form field
- `createCustomerFormField(tenantId, orderTypeId, input)` - Create form field
- `updateCustomerFormField(fieldId, tenantId, input)` - Update form field
- `deleteCustomerFormField(fieldId, tenantId)` - Delete form field
- `reorderCustomerFormFields(fieldIds[], tenantId)` - Reorder fields by updating order_index

**Combined Operations:**
- `getOrderTypeWithFormFields(orderTypeId, tenantId)` - Get order type with nested form fields
- `getAllOrderTypesWithFormFields(tenantId)` - Get all order types with their form fields

**Validation:**
- Uses Zod schemas: `orderTypeSchema` and `customerFormFieldSchema`
- All operations verify tenant admin access via `verifyTenantAdmin()`

### `src/lib/order-types-client.ts`

Client-side services for customer-facing components:
- `getEnabledOrderTypesByTenantClient(tenantId)` - Get enabled order types (public)
- `getCustomerFormFieldsByOrderTypeClient(orderTypeId, tenantId)` - Get form fields (public)

## Server Actions

### `src/app/actions/order-types.ts`

**Order Types Actions:**
- `getOrderTypesAction(tenantId)` - Fetch all order types
- `getOrderTypeAction(orderTypeId, tenantId)` - Fetch single order type
- `createOrderTypeAction(tenantId, tenantSlug, input)` - Create with path revalidation
- `updateOrderTypeAction(orderTypeId, tenantId, tenantSlug, input)` - Update with path revalidation
- `deleteOrderTypeAction(orderTypeId, tenantId, tenantSlug)` - Delete with path revalidation
- `toggleOrderTypeEnabledAction(orderTypeId, tenantId, tenantSlug, enabled)` - Toggle with path revalidation

**Customer Form Fields Actions:**
- `getCustomerFormFieldsAction(orderTypeId, tenantId)` - Fetch form fields
- `getCustomerFormFieldAction(fieldId, tenantId)` - Fetch single field
- `createCustomerFormFieldAction(...)` - Create field with revalidation
- `updateCustomerFormFieldAction(...)` - Update field with revalidation
- `deleteCustomerFormFieldAction(...)` - Delete field with revalidation
- `reorderCustomerFormFieldsAction(fieldIds[], tenantId, tenantSlug)` - Reorder fields

**Combined Actions:**
- `getAllOrderTypesWithFormFieldsAction(tenantId)` - Get all with form fields

All actions return: `{ success: boolean, data?: T, error?: string }`

## Admin UI Components

### `src/components/admin/order-types-list.tsx`

**Features:**
- Displays order types in a card grid layout
- Shows order type icon, name, description, and type badge
- Displays form field count per order type
- Preview of form fields (first 3, with "+X more" indicator)
- Enable/disable toggle button
- "Configure" button (links to detail page - **PAGE MISSING**)
- Delete button with confirmation dialog
- Empty state when no order types exist

**UI Elements:**
- Color-coded badges for each type (green=dine_in, blue=pickup, orange=delivery)
- Icons for each type (🍽️, 📦, 🚚)
- Visual indicators for enabled/disabled state

### `src/app/[tenant]/admin/order-types/page.tsx`

**Page Structure:**
- Breadcrumbs navigation
- Page title and description
- Renders `OrderTypesList` component
- Fetches order types with form fields using `getAllOrderTypesWithFormFields()`

**Missing Feature:**
- The "Configure" button in `OrderTypesList` links to `/${tenantSlug}/admin/order-types/${orderType.id}` but this route/page does not exist
- Should implement a detail/edit page for configuring individual order types and their form fields

## Customer-Facing Integration

### Checkout Flow (`src/app/[tenant]/checkout/page.tsx`)

**Order Type Selection:**
1. Loads enabled order types on page load
2. Sets first order type as default if none selected
3. Displays order type cards with icons (UtensilsCrossed, Package, Truck)
4. Allows customer to select order type (stored in cart via `useCart` hook)
5. Dynamic form fields load when order type changes

**Form Fields Rendering:**
- Loads form fields for selected order type
- Renders fields based on `field_type`:
  - `text`, `email`, `phone`, `number` → Input fields
  - `textarea` → Textarea
  - `select` → Select dropdown (if options provided)
- Special handling for `delivery_address` field:
  - Uses `MapboxAddressAutocomplete` component
  - Captures address, latitude, and longitude
- Validates required fields before checkout
- Stores form data in `customerData` state

**Order Creation:**
- Passes `orderType` (ID) to `createOrderAction()`
- Passes `customerData` (Record<string, string>) to store form field values
- Order type name is denormalized and stored in `order_type` field

### Cart Integration (`src/hooks/useCart.tsx`)

The cart hook manages:
- `orderType`: Currently selected order type ID
- `setOrderType(orderTypeId)`: Function to change order type

Order type is stored in cart state (likely localStorage).

### Order Creation (`src/lib/orders-service.ts`)

The `createOrder()` function:
- Accepts `orderTypeId` parameter
- Fetches order type name and stores in `order_type` field (denormalized)
- Stores `order_type_id` for reference
- Stores `customer_data` as JSONB for dynamic form field values
- Used when `tenant.enable_order_management` is true

## TypeScript Types

### `src/types/database.ts`

**OrderType Interface:**
```typescript
interface OrderType {
  id: string
  tenant_id: string
  type: 'dine_in' | 'pickup' | 'delivery'
  name: string
  description?: string
  is_enabled: boolean
  order_index: number
  created_at: string
  updated_at: string
}
```

**CustomerFormField Interface:**
```typescript
interface CustomerFormField {
  id: string
  tenant_id: string
  order_type_id: string
  field_name: string
  field_label: string
  field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number'
  is_required: boolean
  placeholder?: string
  validation_rules?: Record<string, unknown>
  options?: string[]
  order_index: number
  created_at: string
  updated_at: string
}
```

**Order Interface Extension:**
```typescript
interface Order {
  // ... other fields
  order_type_id?: string
  order_type?: string
  customer_data?: Record<string, unknown>
  // ... other fields
}
```

## Key Features

### ✅ Implemented

1. **Order Type Management:**
   - CRUD operations for order types
   - Enable/disable toggle
   - Default order types for all tenants
   - Unique constraint per tenant per type

2. **Form Field Management:**
   - Dynamic form fields per order type
   - Multiple field types (text, email, phone, textarea, select, number)
   - Required/optional fields
   - Custom validation rules
   - Field ordering/reordering
   - Default fields for each order type

3. **Customer-Facing Integration:**
   - Order type selection in checkout
   - Dynamic form generation based on selected order type
   - Form validation
   - Special handling for delivery address with Mapbox
   - Order creation with order type data

4. **Security:**
   - Row Level Security policies
   - Admin verification for all mutations
   - Public read access for enabled order types only

5. **Data Storage:**
   - Order type reference in orders
   - Denormalized order type name
   - Dynamic customer data as JSONB

### ⚠️ Missing/Incomplete

1. **Order Type Detail/Edit Page:**
   - Route exists in component link: `/${tenantSlug}/admin/order-types/[id]`
   - Page does not exist: `src/app/[tenant]/admin/order-types/[id]/page.tsx`
   - Should allow:
     - Edit order type name, description
     - Reorder form fields (drag-and-drop?)
     - Add/edit/delete form fields inline
     - Preview form appearance

2. **Form Field Advanced Features:**
   - `validation_rules` JSONB field exists but not utilized in UI
   - `options` field for select types exists but needs better UI support
   - Field type changes not validated against existing data

3. **Order Type Ordering:**
   - `order_index` exists but no UI to reorder order types
   - Should allow drag-and-drop or up/down buttons

4. **Default Data Management:**
   - Default order types are created but can be deleted
   - Should consider preventing deletion of all order types
   - Should warn if disabling all order types

5. **Order Display:**
   - Orders list doesn't prominently display order type
   - Should show order type badge/icon in orders table

## Recommendations

### High Priority

1. **Create Order Type Detail Page:**
   ```
   src/app/[tenant]/admin/order-types/[id]/page.tsx
   ```
   - Edit order type details
   - Manage form fields
   - Preview customer form

2. **Add Order Type Reordering:**
   - Add drag-and-drop or up/down controls in list
   - Update `order_index` via `updateOrderTypeAction`

3. **Enhance Orders Display:**
   - Show order type in orders list
   - Filter orders by order type
   - Show customer form data in order details

### Medium Priority

1. **Validation Rules UI:**
   - Create UI for managing `validation_rules` JSONB
   - Apply validation rules in checkout form

2. **Select Field Options:**
   - Better UI for managing `options` array for select fields
   - Display select dropdown in checkout when options exist

3. **Order Type Analytics:**
   - Statistics by order type
   - Most popular order type
   - Revenue by order type

### Low Priority

1. **Order Type Templates:**
   - Predefined templates for common configurations
   - Quick setup wizard

2. **Form Field Validation:**
   - Real-time validation in checkout
   - Custom validation messages from `validation_rules`

3. **Bulk Operations:**
   - Enable/disable multiple order types
   - Duplicate order type with form fields

## File Structure

```
src/
├── app/
│   ├── [tenant]/
│   │   ├── admin/
│   │   │   └── order-types/
│   │   │       └── page.tsx                    ✅ List page
│   │   │       └── [id]/
│   │   │           └── page.tsx                 ❌ MISSING - Detail/Edit page
│   │   └── checkout/
│   │       └── page.tsx                         ✅ Uses order types
│   ├── actions/
│   │   └── order-types.ts                       ✅ Server actions
│   │   └── orders.ts                            ✅ Uses order types
├── components/
│   └── admin/
│       └── order-types-list.tsx                 ✅ List component
├── lib/
│   ├── order-types-service.ts                   ✅ Server service
│   ├── order-types-client.ts                    ✅ Client service
│   └── orders-service.ts                        ✅ Uses order types
├── types/
│   └── database.ts                              ✅ Type definitions
└── hooks/
    └── useCart.tsx                              ✅ Manages order type

supabase/
└── migrations/
    └── 0009_order_types.sql                     ✅ Schema & defaults
```

## Testing Checklist

- [ ] Create new order type
- [ ] Edit order type details
- [ ] Toggle order type enable/disable
- [ ] Delete order type (verify cascade to form fields)
- [ ] Create form field
- [ ] Edit form field
- [ ] Delete form field
- [ ] Reorder form fields
- [ ] Select order type in checkout
- [ ] Fill customer form with different field types
- [ ] Validate required fields
- [ ] Create order with order type
- [ ] View order with order type in admin
- [ ] Test RLS policies (public read, admin write)

## Summary

The order types system is **well-architected** with:
- ✅ Comprehensive database schema
- ✅ Full CRUD operations
- ✅ Security (RLS policies)
- ✅ Customer-facing integration
- ✅ Dynamic form fields

**Main Gap:** Missing detail/edit page for configuring individual order types and their form fields in the admin UI.

