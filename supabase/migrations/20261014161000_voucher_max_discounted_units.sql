-- Per-unit vouchers: "50% off ONE fries" when the table ordered five.
--
-- NULL = every eligible unit (every voucher saved before this column existed).
-- A number = only that many units get the discount: the cheapest eligible
-- units, unless the cashier or customer chose which (see
-- src/lib/vouchers/discount.ts). Free delivery discounts the fee, not food,
-- so it never carries a unit limit.

alter table public.vouchers
  add column if not exists max_discounted_units integer;

alter table public.vouchers
  drop constraint if exists vouchers_max_discounted_units_check;

alter table public.vouchers
  add constraint vouchers_max_discounted_units_check
  check (
    max_discounted_units is null
    or (max_discounted_units >= 1 and discount_type <> 'free_delivery')
  );

comment on column public.vouchers.max_discounted_units is
  'Only this many units get the discount (cheapest unless chosen). NULL = every eligible unit. Never set on free_delivery.';
