# 🚨 QUICK FIX - Payment Method Order Types RLS Issue

## The Problem

The RLS (Row Level Security) policy for `payment_method_order_types` is preventing you from creating associations between payment methods and order types.

## The Fix (Copy & Paste This SQL)

Go to Supabase Dashboard → SQL Editor and run this:

```sql
-- Fix RLS Policies for Payment Method Order Types

-- Drop existing restrictive policies
drop policy if exists payment_method_order_types_write_admin on public.payment_method_order_types;

-- Create more permissive admin write policy
create policy payment_method_order_types_write_admin on public.payment_method_order_types
  for all
  using (
    exists (
      select 1 from public.payment_methods pm
      where pm.id = payment_method_id 
      and exists (
        select 1 from public.app_users au 
        where au.user_id = auth.uid() 
        and (
          au.role = 'superadmin' 
          or (au.role = 'admin' and au.tenant_id = pm.tenant_id)
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.payment_methods pm
      where pm.id = payment_method_id 
      and exists (
        select 1 from public.app_users au 
        where au.user_id = auth.uid() 
        and (
          au.role = 'superadmin' 
          or (au.role = 'admin' and au.tenant_id = pm.tenant_id)
        )
      )
    )
  );
```

## After Running This

1. Refresh your admin page
2. Edit your payment method
3. Check order type boxes
4. Save - should work now! ✅

---

## Alternative: Check Your Permissions

Run this in Supabase SQL Editor to verify your user is set up correctly:

```sql
SELECT 
  au.user_id,
  au.role,
  au.tenant_id,
  u.email
FROM app_users au
JOIN auth.users u ON u.id = au.user_id
WHERE u.email = 'your-email@example.com';
```

Replace `your-email@example.com` with your actual email.

Should return:
- role: 'admin' or 'superadmin'
- tenant_id: Your tenant's UUID (if admin)

If it returns nothing, you're not set up as an admin!

