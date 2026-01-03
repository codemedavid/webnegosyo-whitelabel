# Order Types System - Comprehensive Analysis

**Generated:** November 6, 2025  
**Codebase:** White Label Restaurant Platform

---

## 📋 Executive Summary

The Order Types system is a **fully-featured, well-architected** component that allows multi-tenant restaurants to configure different order fulfillment methods (Dine-In, Pick-Up, Delivery) with customizable customer information forms. The system is production-ready with comprehensive CRUD operations, security policies, and customer-facing integration.

### Status: ✅ **Production Ready**

**Missing Components:**
1. ⚠️ Order Type Detail/Edit Page (`/[tenant]/admin/order-types/[id]/page.tsx`)
2. 🔄 Order type display in admin orders list could be enhanced

---

## 🏗️ Architecture Overview

### Database Schema

#### 1. **`order_types` Table**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK → tenants)
- type (enum: 'dine_in' | 'pickup' | 'delivery')
- name (text) - Display name
- description (text, optional)
- is_enabled (boolean, default: true)
- order_index (integer) - Controls display order
- created_at, updated_at (timestamptz)
```

**Constraints:**
- Unique: `(tenant_id, type)` - One of each type per tenant
- Check constraint on `type` field
- Indexes on `tenant_id` and `(tenant_id, is_enabled)`

#### 2. **`customer_form_fields` Table**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK → tenants)
- order_type_id (uuid, FK → order_types, CASCADE DELETE)
- field_name (text) - Internal identifier
- field_label (text) - Display label
- field_type (enum: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number')
- is_required (boolean, default: false)
- placeholder (text, optional)
- validation_rules (jsonb) - Future use
- options (jsonb) - For select dropdowns
- order_index (integer) - Controls field order
- created_at, updated_at (timestamptz)
```

**Indexes:**
- `customer_form_fields_tenant_idx` on `tenant_id`
- `customer_form_fields_order_type_idx` on `order_type_id`

#### 3. **`orders` Table Extensions**
```sql
- order_type_id (uuid, FK → order_types) - Reference to order type
- order_type (text) - Denormalized name for queries
- customer_data (jsonb) - Stores dynamic form data
```

**Indexes:**
- `orders_order_type_idx` on `order_type_id`
- `orders_order_type_text_idx` on `(tenant_id, order_type)`

---

## 🔒 Security - Row Level Security (RLS)

### Order Types Policies

1. **Public Read (Enabled Only):**
   ```sql
   order_types_read_active
   ```
   - Users can read enabled order types for active tenants
   - No authentication required for customer-facing views

2. **Admin Write:**
   ```sql
   order_types_write_admin
   ```
   - Only superadmin or tenant admin can create/update/delete
   - Enforced at database level

### Customer Form Fields Policies

1. **Public Read (Active Only):**
   ```sql
   customer_form_fields_read_active
   ```
   - Users can read form fields for enabled order types of active tenants

2. **Admin Write:**
   ```sql
   customer_form_fields_write_admin
   ```
   - Only superadmin or tenant admin can manage form fields

---

## 🛠️ Service Layer Architecture

### Server-Side Services

#### **`src/lib/order-types-service.ts`** (Admin Operations)

**Order Types Operations:**
```typescript
✅ getOrderTypesByTenant(tenantId)
✅ getEnabledOrderTypesByTenant(tenantId)
✅ getOrderTypeById(orderTypeId, tenantId)
✅ createOrderType(tenantId, input)
✅ updateOrderType(orderTypeId, tenantId, input)
✅ deleteOrderType(orderTypeId, tenantId)
✅ toggleOrderTypeEnabled(orderTypeId, tenantId, enabled)
✅ initializeOrderTypesForTenant(tenantId)
```

**Customer Form Fields Operations:**
```typescript
✅ getCustomerFormFieldsByOrderType(orderTypeId, tenantId)
✅ getCustomerFormFieldById(fieldId, tenantId)
✅ createCustomerFormField(tenantId, orderTypeId, input)
✅ updateCustomerFormField(fieldId, tenantId, input)
✅ deleteCustomerFormField(fieldId, tenantId)
✅ reorderCustomerFormFields(fieldIds[], tenantId)
```

**Combined Operations:**
```typescript
✅ getOrderTypeWithFormFields(orderTypeId, tenantId)
✅ getAllOrderTypesWithFormFields(tenantId)
```

**Validation:**
- Uses Zod schemas for type safety
- All mutations verify tenant admin access via `verifyTenantAdmin()`

#### **`src/lib/order-types-client.ts`** (Customer-Facing)

```typescript
✅ getEnabledOrderTypesByTenantClient(tenantId)
✅ getCustomerFormFieldsByOrderTypeClient(orderTypeId, tenantId)
```

- Client-side services for public data access
- No admin verification required

---

## 🎬 Server Actions Layer

### **`src/app/actions/order-types.ts`**

All actions return standardized response:
```typescript
{ success: boolean, data?: T, error?: string }
```

**Order Types Actions:**
```typescript
✅ getOrderTypesAction(tenantId)
✅ getOrderTypeAction(orderTypeId, tenantId)
✅ createOrderTypeAction(tenantId, tenantSlug, input)
✅ updateOrderTypeAction(orderTypeId, tenantId, tenantSlug, input)
✅ deleteOrderTypeAction(orderTypeId, tenantId, tenantSlug)
✅ toggleOrderTypeEnabledAction(orderTypeId, tenantId, tenantSlug, enabled)
✅ reorderOrderTypesAction(orderTypeIds[], tenantId, tenantSlug)
```

**Customer Form Fields Actions:**
```typescript
✅ getCustomerFormFieldsAction(orderTypeId, tenantId)
✅ getCustomerFormFieldAction(fieldId, tenantId)
✅ createCustomerFormFieldAction(...)
✅ updateCustomerFormFieldAction(...)
✅ deleteCustomerFormFieldAction(...)
✅ reorderCustomerFormFieldsAction(fieldIds[], tenantId, tenantSlug)
```

**Combined Actions:**
```typescript
✅ getAllOrderTypesWithFormFieldsAction(tenantId)
```

**Path Revalidation:**
- All mutations revalidate relevant paths
- Ensures UI stays in sync with server state

---

## 🎨 UI Components

### Admin Components

#### **`src/components/admin/order-types-list.tsx`**

**Features:**
- ✅ Card grid layout with 3 order types per row
- ✅ Visual indicators: icons (🍽️ 📦 🚚), color-coded badges
- ✅ Shows form field count per order type
- ✅ Preview of first 3 form fields
- ✅ Enable/disable toggle button
- ✅ Up/Down reordering buttons with instant feedback
- ✅ Delete button with confirmation dialog
- ✅ Configure button (links to detail page)
- ✅ Empty state with call-to-action

**UI Details:**
- **Color Coding:**
  - 🟢 Dine In: Green badge
  - 🔵 Pick Up: Blue badge
  - 🟠 Delivery: Orange badge
- **Reordering:** ChevronUp/ChevronDown buttons
- **State Management:** Optimistic updates with server sync

#### **`src/app/[tenant]/admin/order-types/page.tsx`**

**Features:**
- ✅ Breadcrumb navigation
- ✅ Page title and description
- ✅ Renders `OrderTypesList` component
- ✅ Auto-initializes default order types if missing
- ✅ Fetches all order types with nested form fields

**Missing:**
- ❌ Detail/Edit page: `/[tenant]/admin/order-types/[id]/page.tsx`
- ❌ Create/New page: `/[tenant]/admin/order-types/new/page.tsx`

---

## 🛒 Customer-Facing Integration

### Checkout Flow

#### **`src/app/[tenant]/checkout/page.tsx`**

**Order Type Selection (Lines 28-64):**
1. Loads enabled order types on mount
2. Auto-selects first order type if none selected
3. Displays order type cards with icons
4. Allows customer to select order type
5. Stores selection in cart via `useCart` hook

**Dynamic Form Fields (Lines 76-116):**
1. Loads form fields when order type changes
2. Initializes `customerData` state with empty values
3. Validates required fields before checkout
4. Special handling for `delivery_address` field:
   - Uses `MapboxAddressAutocomplete` component
   - Captures address, latitude, longitude

**Form Rendering:**
```typescript
// Field type mapping
'text', 'email', 'phone', 'number' → Input
'textarea' → Textarea  
'select' → Select dropdown (if options provided)
```

**Order Creation (Lines 80-93):**
- Passes `orderType` (ID) to `createOrderAction()`
- Passes `customerData` as JSONB to store form values
- Order type name is denormalized in `order_type` field

### Cart Integration

#### **`src/hooks/useCart.tsx`**

```typescript
interface CartState {
  orderType: string | null  // Selected order type ID
  setOrderType: (orderTypeId: string) => void
  // ... other cart state
}
```

- Order type stored in localStorage: `restaurant_order_type`
- Persists across page refreshes

### Order Creation

#### **`src/lib/orders-service.ts`**

```typescript
async function createOrder(
  tenantId: string,
  items: OrderItem[],
  customerInfo?: CustomerInfo,
  orderTypeId?: string,          // ← Order type ID
  customerData?: Record<string, unknown>,  // ← Dynamic form data
  // ... other params
)
```

**Process:**
1. Fetches order type name from `order_types` table
2. Stores `order_type_id` (reference)
3. Stores `order_type` (denormalized name)
4. Stores `customer_data` as JSONB

---

## 🚀 Default Data & Auto-Initialization

### Migration: `0011_auto_create_order_types.sql`

**Database Trigger:**
```sql
create trigger auto_create_order_types_on_tenant_insert
  after insert on public.tenants
  for each row
  execute function create_default_order_types_for_tenant();
```

**What It Does:**
- Automatically creates 3 default order types when tenant is created
- Creates default form fields for each order type

**Default Order Types:**

1. **Dine In** (order_index: 0)
   - Description: "Enjoy your meal at our restaurant"
   - Form Fields:
     - `customer_name` (text, optional)
     - `table_number` (text, optional)

2. **Pick Up** (order_index: 1)
   - Description: "Order ahead and pick up at our location"
   - Form Fields:
     - `customer_name` (text, **required**)
     - `customer_phone` (phone, **required**)

3. **Delivery** (order_index: 2)
   - Description: "Get your order delivered to your door"
   - Form Fields:
     - `customer_name` (text, **required**)
     - `customer_phone` (phone, **required**)
     - `delivery_address` (textarea, **required**)

**Manual Initialization:**
```sql
-- Function for existing tenants
select initialize_order_types_for_tenant('tenant-uuid');
```

Also callable from code:
```typescript
await initializeOrderTypesForTenant(tenantId)
```

---

## 📊 Integration with Other Systems

### 1. Payment Methods Integration

**`payment_method_order_types` Junction Table:**
```sql
- payment_method_id (FK → payment_methods)
- order_type_id (FK → order_types)
```

**Purpose:** Associates payment methods with specific order types

**Example:**
- Cash on Delivery → Only available for "Delivery" order type
- Pay at Counter → Only for "Dine In" and "Pick Up"

**Integration Points:**
- `src/lib/payment-methods-service.ts`
- `src/lib/payment-methods-client.ts`
- Checkout page loads payment methods filtered by selected order type

### 2. Lalamove Delivery Integration

**Checkout Flow (Lines 126-170 of checkout page):**
```typescript
// Only fetch delivery quote if:
1. Selected order type is 'delivery'
2. Tenant has lalamove_enabled = true
3. Restaurant address is configured
4. Customer enters delivery address
```

**Process:**
1. Customer selects "Delivery" order type
2. Customer enters delivery address
3. System automatically calls Lalamove API for quote
4. Displays delivery fee in order summary
5. Stores `lalamoveQuotationId` with order

### 3. Orders Management

**Order Display (`src/components/admin/orders-list.tsx`):**
- Shows order type badge with icon
- Displays order type name
- Shows customer data from JSONB field
- Filter orders by order type (dropdown filter)

---

## 📁 File Structure

```
src/
├── app/
│   ├── [tenant]/
│   │   ├── admin/
│   │   │   └── order-types/
│   │   │       ├── page.tsx                    ✅ List page
│   │   │       ├── [id]/
│   │   │       │   └── page.tsx                ❌ MISSING - Detail/Edit page
│   │   │       └── new/
│   │   │           └── page.tsx                ❌ MISSING - Create page
│   │   └── checkout/
│   │       └── page.tsx                         ✅ Uses order types
│   ├── actions/
│   │   ├── order-types.ts                       ✅ Server actions
│   │   └── orders.ts                            ✅ Uses order types
├── components/
│   ├── admin/
│   │   ├── order-types-list.tsx                 ✅ List component
│   │   └── orders-list.tsx                      ✅ Shows order type
│   └── customer/
│       └── item-detail-modal.tsx                ✅ (no order type logic)
├── lib/
│   ├── order-types-service.ts                   ✅ Server service
│   ├── order-types-client.ts                    ✅ Client service
│   ├── orders-service.ts                        ✅ Uses order types
│   ├── payment-methods-service.ts               ✅ Integrates with order types
│   └── payment-methods-client.ts                ✅ Filters by order type
├── types/
│   └── database.ts                              ✅ Type definitions
└── hooks/
    └── useCart.tsx                              ✅ Manages order type selection

supabase/
└── migrations/
    ├── 0009_order_types.sql                     ✅ Initial schema
    ├── 0011_auto_create_order_types.sql         ✅ Triggers & defaults
    └── 0012_payment_methods.sql                 ✅ Payment integration
```

---

## ✅ Implemented Features

### Core Functionality
- ✅ CRUD operations for order types
- ✅ CRUD operations for customer form fields
- ✅ Enable/disable toggle per order type
- ✅ Reordering order types (up/down buttons)
- ✅ Reordering form fields
- ✅ Default order types for all tenants
- ✅ Auto-creation via database trigger
- ✅ Unique constraint per tenant per type
- ✅ Cascade deletion (order type → form fields)

### Form Field Features
- ✅ Multiple field types (text, email, phone, textarea, select, number)
- ✅ Required/optional fields
- ✅ Custom placeholders
- ✅ Field ordering with `order_index`
- ✅ Options array for select fields
- ✅ Validation rules JSONB (schema present, not fully utilized)

### Customer-Facing Features
- ✅ Order type selection in checkout
- ✅ Dynamic form generation
- ✅ Form validation (required fields)
- ✅ Special handling for delivery address with Mapbox
- ✅ Order creation with order type data
- ✅ Payment method filtering by order type
- ✅ Lalamove integration for delivery orders

### Security
- ✅ Row Level Security policies
- ✅ Admin verification for all mutations
- ✅ Public read access for enabled order types only
- ✅ Tenant isolation at database level

### Data Storage
- ✅ Order type reference in orders
- ✅ Denormalized order type name
- ✅ Dynamic customer data as JSONB
- ✅ Integration with payment methods
- ✅ Integration with Lalamove quotations

---

## ⚠️ Missing/Incomplete Features

### High Priority

#### 1. **Order Type Detail/Edit Page** ❌
**Route:** `src/app/[tenant]/admin/order-types/[id]/page.tsx`

**Current Situation:**
- "Configure" button in list component links to this route
- Route does not exist (404 error)

**Should Include:**
- Edit order type name, description, type
- Toggle enable/disable
- List of form fields with inline editing
- Add/edit/delete form fields
- Reorder form fields (drag-and-drop or up/down buttons)
- Preview of customer form appearance
- Breadcrumbs: Dashboard → Order Types → [Order Type Name]

**Recommended Implementation:**
```typescript
// Components needed:
- OrderTypeForm (edit name, description)
- FormFieldsList (list of fields with CRUD)
- FormFieldForm (add/edit field modal)
- CustomerFormPreview (show what customers see)
```

#### 2. **Order Type Create/New Page** ❌
**Route:** `src/app/[tenant]/admin/order-types/new/page.tsx`

**Current Situation:**
- "Add Order Type" button exists in list component
- Links to this route (404 error)

**Should Include:**
- Create new order type form
- Select type (dine_in, pickup, delivery)
- Enter name and description
- Set initial enabled state
- Option to use default form fields
- Or create custom form fields

#### 3. **Enhanced Order Display in Admin** ⚠️
**Current:** Order type shown but could be more prominent

**Improvements:**
- Order type badge/icon in orders table
- Filter orders by order type (dropdown)
- Show customer form data in order details modal
- Export orders with order type data

### Medium Priority

#### 4. **Validation Rules UI** 🔄
**Current:** `validation_rules` JSONB field exists but not utilized

**Should Add:**
- UI for managing validation rules in form field editor
- Examples: min/max length, regex patterns, custom messages
- Apply validation rules in checkout form
- Display custom error messages

#### 5. **Select Field Options Manager** 🔄
**Current:** `options` JSONB exists, basic support in checkout

**Should Add:**
- Better UI for managing options array
- Add/edit/remove options inline
- Reorder options
- Set default selected option

#### 6. **Order Type Analytics** 📊
**New Feature:**
- Dashboard widget: Orders by order type
- Most popular order type
- Revenue by order type
- Average order value by order type
- Time-based trends (chart)

### Low Priority

#### 7. **Order Type Templates** 💡
**New Feature:**
- Predefined templates for common configurations
- Quick setup wizard for new tenants
- Industry-specific templates (restaurant, cafe, bakery)

#### 8. **Form Field Validation** 🔍
**Enhancement:**
- Real-time validation in checkout
- Custom validation messages from `validation_rules`
- Field dependencies (conditional fields)

#### 9. **Bulk Operations** ⚡
**New Feature:**
- Enable/disable multiple order types at once
- Duplicate order type with form fields
- Export/import order type configurations

#### 10. **Order Type Constraints** 🔒
**Enhancement:**
- Prevent deletion of all order types
- Warn if disabling all order types
- Minimum one enabled order type rule

---

## 🧪 Testing Checklist

### Order Types Management
- [ ] Create new order type
- [ ] Edit order type details (name, description)
- [ ] Toggle order type enable/disable
- [ ] Reorder order types (move up/down)
- [ ] Delete order type (verify cascade to form fields)
- [ ] Verify unique constraint (cannot create duplicate type)

### Form Fields Management
- [ ] Create form field
- [ ] Edit form field details
- [ ] Change field type
- [ ] Toggle required/optional
- [ ] Reorder form fields
- [ ] Delete form field
- [ ] Add options for select field type

### Customer Checkout Flow
- [ ] Select order type in checkout
- [ ] Verify correct form fields load
- [ ] Fill customer form with different field types
- [ ] Validate required fields (should block checkout)
- [ ] Submit form with optional fields empty
- [ ] Test delivery address with Mapbox autocomplete
- [ ] Verify payment methods filter by order type

### Order Creation & Display
- [ ] Create order with order type
- [ ] View order in admin with order type displayed
- [ ] Filter orders by order type
- [ ] Verify customer data stored correctly in JSONB
- [ ] Check denormalized order type name

### Security & Permissions
- [ ] Test RLS policies (public read, admin write)
- [ ] Verify non-admin cannot modify order types
- [ ] Verify tenant isolation (cannot access other tenant's order types)
- [ ] Test with superadmin role
- [ ] Test with tenant admin role

### Integration Tests
- [ ] Lalamove integration with delivery order type
- [ ] Payment methods filtered by order type
- [ ] Auto-create order types on new tenant signup
- [ ] Order type in Messenger message generation

### Edge Cases
- [ ] No order types configured (should auto-create)
- [ ] All order types disabled (should show warning)
- [ ] Delete last order type (should prevent or warn)
- [ ] Order type with no form fields
- [ ] Very long form field list (10+ fields)

---

## 🎯 Recommendations

### Immediate Action Items

1. **Create Order Type Detail Page** (High Priority)
   - Essential for completing the admin UX
   - Users expect this page when clicking "Configure"
   - Implement full CRUD for form fields

2. **Create Order Type New Page** (High Priority)
   - Complete the order type creation flow
   - Allow custom order type configurations

3. **Enhance Order Display** (Medium Priority)
   - Make order type more visible in orders list
   - Add filtering by order type
   - Show customer form data in details modal

### Future Enhancements

1. **Validation Rules System** (Medium Priority)
   - Unlock full potential of JSONB validation rules
   - Provide rich form validation experience

2. **Analytics Dashboard** (Medium Priority)
   - Help tenants understand their order patterns
   - Drive business decisions with data

3. **Form Builder UI** (Low Priority)
   - Drag-and-drop form builder
   - Visual form preview
   - Conditional field logic

---

## 💡 Best Practices Implemented

### Code Quality
- ✅ Zod schemas for type safety
- ✅ TypeScript interfaces for all entities
- ✅ Consistent error handling
- ✅ Server actions return standardized responses
- ✅ Path revalidation after mutations

### Database Design
- ✅ Normalized schema with proper foreign keys
- ✅ Cascade deletion for cleanup
- ✅ Indexes on frequently queried columns
- ✅ JSONB for flexible data storage
- ✅ Check constraints for enum-like fields

### Security
- ✅ Row Level Security enforced at database level
- ✅ Admin verification in all mutation services
- ✅ Public read policies for customer-facing data
- ✅ Tenant isolation guaranteed

### User Experience
- ✅ Optimistic UI updates
- ✅ Toast notifications for actions
- ✅ Loading states
- ✅ Empty states with CTAs
- ✅ Confirmation dialogs for destructive actions

---

## 🔗 Related Systems

### Directly Integrated
1. **Orders Management** - Stores order type and customer data
2. **Payment Methods** - Filtered by order type
3. **Lalamove Delivery** - Triggered for delivery order types
4. **Cart System** - Stores selected order type
5. **Checkout Flow** - Primary consumer of order types

### Indirectly Related
1. **Menu Management** - No direct integration (could add order type availability per item)
2. **Tenant Branding** - Could customize order type names/descriptions
3. **Analytics** - Could track metrics by order type

---

## 📈 Performance Considerations

### Database Queries
- ✅ Indexes on `tenant_id` and `is_enabled`
- ✅ Composite index on `(tenant_id, is_enabled)`
- ✅ Foreign key indexes for joins
- ✅ Order by `order_index` for sorted results

### Caching
- ✅ Next.js page caching for server components
- ✅ Revalidation on mutations
- ⚠️ Could implement Redis caching for order types (rarely change)

### Client-Side
- ✅ Client-side services separate from admin services
- ✅ Only load enabled order types for customers
- ✅ Form fields loaded on-demand

---

## 🚨 Known Issues & Limitations

### Issues
1. ❌ 404 error when clicking "Configure" button
2. ❌ 404 error when clicking "Add Order Type" button
3. ⚠️ No validation when changing field type (could break existing data)

### Limitations
1. Cannot have more than one of each type per tenant
2. Validation rules JSONB schema exists but not fully utilized
3. Cannot conditionally show/hide form fields
4. Cannot have field dependencies (e.g., show "Apartment #" if address type is "Apartment")
5. No A/B testing for different form configurations

---

## 📝 TypeScript Types

### Order Type Interface
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

### Customer Form Field Interface
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

### Order Extension
```typescript
interface Order {
  // ... other fields
  order_type_id?: string
  order_type?: string  // Denormalized
  customer_data?: Record<string, unknown>
  // ... other fields
}
```

---

## 🎓 Summary

The Order Types system is a **robust, production-ready feature** with:

### Strengths ✅
- Comprehensive database schema with proper constraints
- Full CRUD operations with type safety
- Secure RLS policies
- Dynamic form field system
- Excellent customer-facing integration
- Auto-initialization for new tenants
- Integration with payment methods and Lalamove

### Gaps ⚠️
- Missing detail/edit page (breaks UX)
- Missing create/new page (breaks UX)
- Validation rules not fully implemented
- No analytics/reporting

### Verdict 🎯
**8.5/10** - Excellent foundation with minor UI gaps

**Recommendation:** Implement the two missing admin pages (detail and create) to complete the feature and provide a seamless admin experience. The core functionality is solid and well-architected.

---

*End of Analysis*

