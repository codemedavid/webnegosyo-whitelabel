# Order Management Toggle Implementation

## Summary

Implemented a feature that allows superadmins to enable/disable order database management for each tenant. When disabled, orders only redirect to Messenger without being saved to the database or tracked in the admin panel.

---

## What Was Implemented

### 1. Database Migration

**File:** `supabase/migrations/0006_add_enable_order_management.sql`

- Added `enable_order_management` column to the `tenants` table (boolean, defaults to `true`)
- Existing tenants are automatically set to enabled for backward compatibility

### 2. Type Updates

**Files:**
- `src/types/database.ts` - Added `enable_order_management: boolean` to `Tenant` interface
- `src/lib/tenants-service.ts` - Added field to `tenantSchema` with default `true`

### 3. Server Actions & Services

**Files:**
- `src/actions/tenants.ts` - Updated create and update actions to handle the new field
- `src/lib/tenants-service.ts` - Updated create and update functions to persist the field

### 4. Superadmin UI

**File:** `src/components/superadmin/tenant-form-wrapper.tsx`

Created new `OrderManagementSection` component with:
- Toggle switch to enable/disable order tracking
- Clear explanation of what happens when disabled
- Warning message when disabled

```typescript
<OrderManagementSection 
  formData={formData} 
  setFormData={setFormData} 
  isPending={isPending} 
/>
```

### 5. Order Creation Logic

**File:** `src/app/[tenant]/checkout/page.tsx`

Modified checkout flow to check `tenant.enable_order_management`:
- If enabled: Orders are saved to database AND redirected to Messenger
- If disabled: Orders only redirect to Messenger (no database storage)

```typescript
if (tenant.enable_order_management) {
  // Save order to database
  const result = await createOrderAction(...)
}

// Always redirect to Messenger regardless of setting
const messengerUrl = generateMessengerUrl(...)
window.location.href = messengerUrl
```

### 6. Admin UI Visibility

**Files:**
- `src/components/shared/sidebar.tsx` - Filter out orders menu item when disabled
- `src/components/admin/admin-layout-client.tsx` - Pass tenant setting to sidebar

The sidebar automatically hides the "Orders" menu item when `enable_order_management` is `false`.

---

## Behavior

### When Order Management is ENABLED (default)

✅ Orders are saved to the database
✅ Orders appear in the admin panel
✅ Order statistics are tracked on the dashboard
✅ Order history is maintained
✅ Orders are still redirected to Messenger

### When Order Management is DISABLED

❌ Orders are NOT saved to the database
❌ Orders do NOT appear in the admin panel
❌ Order statistics are NOT tracked
❌ Order history is NOT maintained
✅ Orders are still redirected to Messenger (primary flow)

---

## User Experience

### For Superadmins

1. Navigate to tenant settings in the superadmin panel
2. Find the "Order Management Settings" section
3. Toggle "Enable Order Tracking" on/off
4. Save changes
5. The tenant's order management behavior is immediately updated

### For Tenant Admins

- When enabled: Full access to order management features
- When disabled: Orders menu item is hidden from sidebar

### For Customers

- Experience is unchanged - they still complete checkout and redirect to Messenger
- System behavior is transparent to them

---

## Technical Details

### Database Schema

```sql
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS enable_order_management boolean DEFAULT true;
```

### Type Definition

```typescript
interface Tenant {
  // ... other fields
  enable_order_management: boolean;
}
```

### Conditional Logic

The checkout process checks the tenant setting:

```typescript
if (tenant.enable_order_management) {
  // Database operations
  await createOrderAction(...)
}

// Always redirect to Messenger
window.location.href = messengerUrl
```

### Sidebar Filtering

```typescript
const filteredItems = enableOrderManagement === false 
  ? items.filter(item => !item.href.includes('/orders'))
  : items
```

---

## Benefits

1. **Flexibility**: Each tenant can choose their preferred order management approach
2. **Data Privacy**: Some tenants may prefer not to store customer data
3. **Simplicity**: Messenger-only flow is simpler for some use cases
4. **Performance**: Reduces database load for tenants not using order management
5. **Compliance**: Better alignment with privacy requirements

---

## Migration Notes

- Existing tenants default to `enable_order_management = true`
- No data loss for existing orders
- The setting can be toggled at any time
- Changes take effect immediately without tenant restart

---

## Future Enhancements

1. Add data retention policy for tenants with order management disabled
2. Add analytics dashboard showing order management usage by tenant
3. Add export functionality for orders before disabling
4. Add audit log for when the setting is changed

