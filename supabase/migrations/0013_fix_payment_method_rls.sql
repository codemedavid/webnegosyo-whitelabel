    -- Fix RLS Policies for Payment Method Order Types
    -- Migration: 0013_fix_payment_method_rls.sql

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

