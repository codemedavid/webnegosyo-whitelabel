-- This idempotent destination contract also ships in the tenant-order bundle.
-- The caller is the platform projection worker, never a browser or handset.
alter table public.orders add column if not exists source text;
alter table public.orders add column if not exists outlet_id uuid;
alter table public.orders add column if not exists client_order_id text;
alter table public.orders add column if not exists amount_paid numeric(10,2) not null default 0;
create table if not exists public.loyalty_projected_receipts (
 settlement_id uuid primary key,tenant_id uuid not null,order_id uuid not null references public.orders(id),
 receipt jsonb not null,created_at timestamptz not null default now()
);
alter table public.loyalty_projected_receipts enable row level security;
revoke all on public.loyalty_projected_receipts from public,anon,authenticated;
grant select on public.loyalty_projected_receipts to service_role;

create or replace function public.project_loyalty_pos_receipt(p_tenant_id uuid,p_settlement_id uuid,p_receipt jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare existing loyalty_projected_receipts%rowtype; order_id uuid; item jsonb; total numeric; catalog_item uuid; catalog_type uuid; catalog_method uuid;
begin
 if p_tenant_id is null or p_settlement_id is null or p_receipt is null or jsonb_typeof(p_receipt)<>'object'
  or p_receipt->>'source' is distinct from 'pos' or jsonb_typeof(p_receipt->'items') is distinct from 'array'
  or jsonb_array_length(p_receipt->'items')=0 then raise exception 'Invalid canonical receipt'; end if;
 perform pg_advisory_xact_lock(hashtextextended('loyalty-projection:'||p_settlement_id::text,0));
 select * into existing from loyalty_projected_receipts where settlement_id=p_settlement_id;
 if found then
  if existing.tenant_id<>p_tenant_id or existing.receipt<>p_receipt then raise exception 'Receipt differs from original projection'; end if;
  return existing.order_id;
 end if;
 -- Catalog references are optional in historical receipts. Keep the frozen
 -- names/prices even if a merchant has deleted a catalog row before syncing.
 catalog_type:=(p_receipt->>'orderTypeId')::uuid;
 catalog_method:=(p_receipt->'payment'->>'methodId')::uuid;
 if to_regclass('public.order_types') is not null then
  execute 'select id from public.order_types where id=$1 and tenant_id=$2 for key share' into catalog_type using catalog_type,p_tenant_id;
 end if;
 if to_regclass('public.payment_methods') is not null then
  execute 'select id from public.payment_methods where id=$1 and tenant_id=$2 for key share' into catalog_method using catalog_method,p_tenant_id;
 end if;
 total:=(p_receipt->>'totalCentavos')::numeric/100;
 if total is null or total<0 then raise exception 'Invalid total'; end if;
 insert into orders(tenant_id,customer_name,customer_contact,customer_data,total,status,payment_status,
  source,outlet_id,client_order_id,amount_paid,order_type_id,order_type,payment_method_id,payment_method_name,created_at)
 values(p_tenant_id,'Loyalty customer',p_receipt->>'phone',p_receipt->'customerData',total,'confirmed','paid',
  'pos',nullif(p_receipt->>'outletId','')::uuid,'loyalty:'||p_settlement_id::text,total,catalog_type,
  p_receipt->>'orderTypeName',catalog_method,p_receipt->>'paymentMethodName',(p_receipt->>'settledAt')::timestamptz)
 returning id into order_id;
 for item in select * from jsonb_array_elements(p_receipt->'items') loop
  catalog_item:=(item->>'menuItemId')::uuid;
  if to_regclass('public.menu_items') is not null then
   execute 'select id from public.menu_items where id=$1 and tenant_id=$2 for key share' into catalog_item using catalog_item,p_tenant_id;
  end if;
  insert into order_items(order_id,menu_item_id,menu_item_name,quantity,price,subtotal,variation)
  values(order_id,catalog_item,item->>'name',(item->>'quantity')::integer,
   (item->>'unitPriceCentavos')::numeric/100,(item->>'subtotalCentavos')::numeric/100,item->>'variation');
 end loop;
 -- Platform installs have a payment ledger. Tenant installs without it retain
 -- the frozen tender in customer_data.pos until payment-ledger parity ships.
 if to_regclass('public.order_payments') is not null and total>0 then
  execute 'insert into public.order_payments(tenant_id,order_id,kind,amount,payment_method_id,payment_method_name,reference,recorded_by,outlet_id,note,created_at) values($1,$2,''charge'',$3,$4,$5,$6,$7,$8,''Loyalty POS settlement'',$9)'
   using p_tenant_id,order_id,total,catalog_method,p_receipt->>'paymentMethodName',p_receipt->'payment'->>'reference',
    (p_receipt->>'cashierId')::uuid,nullif(p_receipt->>'outletId','')::uuid,(p_receipt->>'settledAt')::timestamptz;
 end if;
 insert into loyalty_projected_receipts(settlement_id,tenant_id,order_id,receipt) values(p_settlement_id,p_tenant_id,order_id,p_receipt);
 return order_id;
end $$;
revoke all on function public.project_loyalty_pos_receipt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.project_loyalty_pos_receipt(uuid,uuid,jsonb) to service_role;

-- One destination snapshot supplies refund evidence, never a client status.
create or replace function public.read_loyalty_refund_evidence(p_tenant_id uuid,p_settlement_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare projected loyalty_projected_receipts%rowtype; state text; charged numeric; refunded numeric;
begin
 select * into projected from loyalty_projected_receipts where tenant_id=p_tenant_id and settlement_id=p_settlement_id;
 if not found then return null; end if;
 select status into state from orders where id=projected.order_id;
 if to_regclass('public.order_payments') is null then
  return jsonb_build_object('status',state,'chargedCentavos',0,'refundedCentavos',0,'totalCentavos',(projected.receipt->>'totalCentavos')::bigint);
 end if;
 execute 'select coalesce(sum(amount) filter(where kind=''charge''),0)*100,coalesce(sum(amount) filter(where kind=''refund''),0)*100 from public.order_payments where tenant_id=$1 and order_id=$2'
  into charged,refunded using p_tenant_id,projected.order_id;
 return jsonb_build_object('status',state,'chargedCentavos',charged,'refundedCentavos',refunded,'totalCentavos',(projected.receipt->>'totalCentavos')::bigint);
end $$;
revoke all on function public.read_loyalty_refund_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_loyalty_refund_evidence(uuid,uuid) to service_role;
