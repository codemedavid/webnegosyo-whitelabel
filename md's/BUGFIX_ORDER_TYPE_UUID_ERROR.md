# Bug Fix: PostgreSQL 22P02 Error - Order Type UUID Issue

**Date:** November 6, 2025  
**Status:** ✅ FIXED  
**Severity:** High (Breaks checkout flow)

---

## 🐛 Bug Description

### Error Details
- **Error Code:** `22P02`
- **PostgreSQL Error:** `invalid_text_representation`
- **Context:** Order creation during checkout
- **Impact:** Customers unable to complete orders when order type not selected or when using legacy flow without order management enabled

### Root Cause

In `src/lib/orders-service.ts` line 238, the `order_type_id` field was being set to `undefined` when no order type was provided:

```typescript
// ❌ BEFORE (Causes 22P02 error)
order_type_id: orderTypeId,  // orderTypeId is optional, can be undefined
```

**Problem:** PostgreSQL cannot convert `undefined` to UUID type. It expects either a valid UUID string or explicit `null`.

---

## ✅ Solution

Changed line 238 to explicitly convert `undefined` to `null`:

```typescript
// ✅ AFTER (Works correctly)
order_type_id: orderTypeId || null,
```

### File Modified
- `src/lib/orders-service.ts` (line 238)

### Why This Works
- When `orderTypeId` is a valid UUID string → it's used as-is
- When `orderTypeId` is `undefined` → converted to `null`
- When `orderTypeId` is empty string `""` → converted to `null`
- PostgreSQL UUID columns accept `null` but reject `undefined`

---

## 🔍 Context

### When This Bug Occurs

1. **Tenant without Order Management:**
   - If `tenant.enable_order_management = false`
   - Checkout doesn't show order type selection
   - `orderTypeId` is `undefined` when creating order
   - ❌ Bug occurs here

2. **Tenant with Order Management but No Order Type Selected:**
   - If user somehow bypasses order type selection
   - `orderTypeId` is `undefined`
   - ❌ Bug occurs here

3. **Legacy Orders:**
   - Orders created before order types feature
   - No `order_type_id` provided
   - ❌ Bug occurs here

### When This Bug DOESN'T Occur

1. **Order Type Selected:**
   - Customer selects Dine-In, Pick-Up, or Delivery
   - `orderTypeId` is a valid UUID
   - ✅ Works fine

---

## 🧪 Testing Scenarios

### Test Case 1: Order WITHOUT Order Type (Primary Bug Fix)
```typescript
// Should work now
await createOrder(
  tenantId,
  items,
  customerInfo,
  undefined,  // ← orderTypeId is undefined
  {}          // ← customerData
)
```

**Expected Result:** ✅ Order created with `order_type_id = null`

### Test Case 2: Order WITH Order Type
```typescript
// Should still work (no regression)
await createOrder(
  tenantId,
  items,
  customerInfo,
  'valid-uuid-here',  // ← orderTypeId is valid UUID
  { customer_name: 'John', customer_phone: '+1234567890' }
)
```

**Expected Result:** ✅ Order created with `order_type_id = 'valid-uuid-here'`

### Test Case 3: Empty String (Edge Case)
```typescript
await createOrder(
  tenantId,
  items,
  customerInfo,
  '',  // ← orderTypeId is empty string
  {}
)
```

**Expected Result:** ✅ Order created with `order_type_id = null`

---

## 🔒 Database Schema Context

### Orders Table Schema
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  order_type_id UUID REFERENCES order_types(id),  -- ← Nullable FK
  order_type TEXT,                                 -- ← Denormalized, nullable
  customer_data JSONB DEFAULT '{}'::jsonb,
  -- ... other fields
);
```

**Key Points:**
- `order_type_id` is a **nullable** foreign key
- Optional because:
  - Not all tenants enable order management
  - Legacy orders don't have order types
  - Backward compatibility requirement

---

## 🚀 Related Code

### Order Creation Function Signature
```typescript
async function createOrder(
  tenantId: string,
  items: Array<OrderItem>,
  customerInfo?: {
    name?: string
    contact?: string
  },
  orderTypeId?: string,                      // ← Optional parameter
  customerData?: Record<string, unknown>,    // ← Optional parameter
  deliveryFee?: number,
  lalamoveQuotationId?: string,
  paymentMethodId?: string,                  // ← Also uses || null pattern
  paymentMethodName?: string,
  paymentMethodDetails?: string,
  paymentMethodQrCodeUrl?: string
): Promise<Order>
```

### Other UUID Fields Handled Correctly
The following optional UUID fields were already using the `|| null` pattern:
```typescript
lalamove_quotation_id: lalamoveQuotationId || null,  ✅
payment_method_id: paymentMethodId || null,          ✅
```

Only `order_type_id` was missing this pattern.

---

## 📊 Impact Assessment

### Before Fix
- ❌ Orders fail when `orderTypeId` is `undefined`
- ❌ Tenants without order management cannot receive orders
- ❌ Legacy checkout flow broken
- ❌ Affects 100% of tenants with `enable_order_management = false`

### After Fix
- ✅ Orders work with or without order type
- ✅ Backward compatible with legacy flow
- ✅ Tenants can operate with order management disabled
- ✅ No regression in existing functionality

---

## 🔗 Related Issues

### Potential Similar Issues (Checked & Safe)

1. **Payment Method ID** ✅ Already handled correctly
   ```typescript
   payment_method_id: paymentMethodId || null,  // Line 246
   ```

2. **Lalamove Quotation ID** ✅ Already handled correctly
   ```typescript
   lalamove_quotation_id: lalamoveQuotationId || null,  // Line 245
   ```

3. **Menu Item ID in Order Items** ✅ Required field (not nullable)
   ```typescript
   menu_item_id: item.menu_item_id,  // Always provided
   ```

---

## 📝 Lessons Learned

### For TypeScript + PostgreSQL Integration

1. **Always handle optional UUID parameters:**
   ```typescript
   // ❌ Bad
   uuid_column: optionalParam
   
   // ✅ Good
   uuid_column: optionalParam || null
   ```

2. **PostgreSQL type strictness:**
   - `undefined` ≠ `null` in database context
   - `undefined` causes type conversion errors
   - `null` is a valid SQL value

3. **TypeScript optional parameters:**
   ```typescript
   function example(param?: string) {
     // param can be: string | undefined
     // But DB wants: string | null
     // Solution: param || null
   }
   ```

---

## 🎯 Prevention

### Code Review Checklist
- [ ] All optional UUID parameters use `|| null` when inserting to DB
- [ ] All optional foreign keys explicitly handle `undefined` case
- [ ] Test with both defined and undefined optional parameters

### ESLint Rule (Future)
Consider adding a rule to catch this pattern:
```javascript
// Detect: someId: optionalUuidParam
// Without: || null
// In: .insert() or .update() calls
```

---

## ✅ Verification

### Manual Testing
```bash
# Test 1: Create order without order type
curl -X POST /api/orders \
  -d '{"tenantId": "...", "items": [...], "orderTypeId": null}'

# Test 2: Create order with order type
curl -X POST /api/orders \
  -d '{"tenantId": "...", "items": [...], "orderTypeId": "valid-uuid"}'
```

### Expected Database Records
```sql
-- Order without order type
SELECT id, order_type_id, order_type FROM orders WHERE id = 'order-1';
-- Result: order_type_id = NULL, order_type = NULL

-- Order with order type
SELECT id, order_type_id, order_type FROM orders WHERE id = 'order-2';
-- Result: order_type_id = 'uuid', order_type = 'Delivery'
```

---

## 📚 References

- **PostgreSQL Error Code 22P02:** https://www.postgresql.org/docs/current/errcodes-appendix.html
- **Supabase Type Conversions:** https://supabase.com/docs/guides/database/types
- **TypeScript Optional Parameters:** https://www.typescriptlang.org/docs/handbook/2/functions.html#optional-parameters

---

## 🎉 Status

**Bug Fixed and Deployed** ✅

No additional changes required. The fix is minimal, safe, and backward compatible.

---

*End of Bug Fix Documentation*

