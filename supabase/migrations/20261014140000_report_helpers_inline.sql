-- ===========================================================================
-- Report helpers: inlinable (no per-row function call).
--
-- The six IMMUTABLE helpers in 20261014110000 carried `set search_path = ''`.
-- A SET clause stops PostgreSQL inlining a SQL function, so each was CALLED
-- once or more per order and per line: a 30-day report on the largest store
-- (6.9k orders) took 0.85 s for the summary and 1.5 s for items, against
-- ~0.1 s to read the same rows. Without the clause they inline into the
-- report queries.
--
-- Why that is safe here: each body calls only pg_catalog built-ins (always
-- resolved first, ahead of any schema the caller could put on its path) and
-- schema-qualified reporting.* helpers; none reads a table; none is SECURITY
-- DEFINER. The functions that DO read tables keep `set search_path = ''`.
-- Expect the "function_search_path_mutable" advisor WARN for exactly these
-- six; it is accepted, not an oversight.
-- ===========================================================================

create or replace function reporting.trim_text(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(p_value, '^\s+|\s+$', '', 'g')
$$;

create or replace function reporting.fold_name(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select reporting.trim_text(regexp_replace(lower(coalesce(p_value, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

create or replace function reporting.cents(p_value numeric)
returns numeric
language sql
immutable
parallel safe
as $$
  select round(coalesce(p_value, 0) * 100)
$$;

create or replace function reporting.discount_payload(p_discount_data jsonb, p_customer_data jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
  select case
    when jsonb_typeof(p_discount_data) = 'object' and jsonb_typeof(p_discount_data -> 'total') = 'number'
      then p_discount_data
    when jsonb_typeof(p_customer_data -> 'discount') = 'object'
     and jsonb_typeof(p_customer_data -> 'discount' -> 'total') = 'number'
      then p_customer_data -> 'discount'
  end
$$;

create or replace function reporting.has_table(p_customer_data jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(
    jsonb_typeof(p_customer_data -> 'table_number') = 'string'
    and reporting.trim_text(
      regexp_replace(
        regexp_replace(reporting.trim_text(p_customer_data ->> 'table_number'), '^(?:table|tbl\.?|t\.)?\s*#?\s*', '', 'i'),
        '\s+', ' ', 'g'
      )
    ) <> '',
    false
  )
$$;

create or replace function reporting.method_key(p_method_id uuid, p_method_name text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_method_id is not null then 'id:' || p_method_id::text
    when reporting.fold_name(p_method_name) <> '' then 'name:' || reporting.fold_name(p_method_name)
    else 'unspecified'
  end
$$;
