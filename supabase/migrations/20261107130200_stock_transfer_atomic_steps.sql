-- Transfer send and receive as ONE transaction.
--
-- Until now the web service (stock-transfers-service.ts) wrote the ledger legs
-- first and flipped the document's status afterwards, as two requests. The
-- ledger guard only allows a transfer_out leg while the transfer is a draft
-- (and transfer_in while it is sent), so the status cannot be claimed first.
-- When the status write failed, the stock had moved while the document still
-- said draft, and the each-leg-once index then refused every retry. Two tabs
-- could also both pass the status check and race.
--
-- Both functions are SECURITY INVOKER: every existing guard still runs as the
-- caller (movement guard, branch rules, `inventory` permission, lifecycle
-- trigger), and `apply_stock_movement` stays the only writer of on-hand
-- quantities. What they add is the row lock on the transfer (the second tab
-- waits, then finds it no longer a draft) and all-or-nothing.
--
-- Apply order: any time before the web deploy that calls them. Additive.

create or replace function public.send_stock_transfer(p_transfer_id uuid, p_legs jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.stock_transfers%rowtype;
begin
  select * into t from public.stock_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'Transfer not found' using errcode = 'P0002';
  end if;
  if t.status <> 'draft' then
    raise exception 'A % transfer cannot be marked sent.', t.status using errcode = '23514';
  end if;
  if jsonb_typeof(p_legs) is distinct from 'array' then
    raise exception 'Legs must be a list' using errcode = '22023';
  end if;

  insert into public.stock_movements
    (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, entered_quantity, unit_cost, note, stock_transfer_id)
  select t.tenant_id,
         (l.leg->>'inventory_item_id')::uuid,
         nullif(l.leg->>'outlet_id', '')::uuid,
         'transfer_out',
         (l.leg->>'quantity_delta')::numeric,
         abs((l.leg->>'quantity_delta')::numeric),
         nullif(l.leg->>'unit_cost', '')::numeric,
         nullif(l.leg->>'note', ''),
         t.id
    from jsonb_array_elements(p_legs) with ordinality as l(leg, n)
   order by l.n;

  update public.stock_transfers
     set status = 'sent', sent_at = now(), sent_by = auth.uid()
   where id = t.id and status = 'draft';
  if not found then
    raise exception 'The transfer changed while sending' using errcode = '40001';
  end if;
end;
$$;

create or replace function public.receive_stock_transfer(p_transfer_id uuid, p_legs jsonb, p_counts jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.stock_transfers%rowtype;
  v_count record;
begin
  select * into t from public.stock_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'Transfer not found' using errcode = 'P0002';
  end if;
  if t.status <> 'sent' then
    raise exception 'A % transfer cannot be marked received.', t.status using errcode = '23514';
  end if;
  if jsonb_typeof(p_legs) is distinct from 'array' or jsonb_typeof(p_counts) is distinct from 'object' then
    raise exception 'Legs must be a list and counts an object' using errcode = '22023';
  end if;

  insert into public.stock_movements
    (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, entered_quantity, unit_cost, note, stock_transfer_id)
  select t.tenant_id,
         (l.leg->>'inventory_item_id')::uuid,
         nullif(l.leg->>'outlet_id', '')::uuid,
         case when l.leg->>'reason' = 'waste' then 'waste' else 'transfer_in' end,
         (l.leg->>'quantity_delta')::numeric,
         abs((l.leg->>'quantity_delta')::numeric),
         nullif(l.leg->>'unit_cost', '')::numeric,
         nullif(l.leg->>'note', ''),
         t.id
    from jsonb_array_elements(p_legs) with ordinality as l(leg, n)
   order by l.n;

  for v_count in select key, value from jsonb_each_text(p_counts) loop
    update public.stock_transfer_lines
       set received_quantity = v_count.value::numeric
     where transfer_id = t.id and tenant_id = t.tenant_id and inventory_item_id = v_count.key::uuid;
    if not found then
      raise exception 'Counted an ingredient that is not on this transfer' using errcode = '23514';
    end if;
  end loop;

  update public.stock_transfers
     set status = 'received', received_at = now(), received_by = auth.uid()
   where id = t.id and status = 'sent';
  if not found then
    raise exception 'The transfer changed while receiving' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.send_stock_transfer(uuid, jsonb) from public, anon;
revoke all on function public.receive_stock_transfer(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.send_stock_transfer(uuid, jsonb) to authenticated, service_role;
grant execute on function public.receive_stock_transfer(uuid, jsonb, jsonb) to authenticated, service_role;
