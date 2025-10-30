-- Add Lalamove delivery fields to orders table
alter table public.orders
add column if not exists delivery_fee numeric(10,2) default 0,
add column if not exists lalamove_quotation_id text,
add column if not exists lalamove_order_id text,
add column if not exists lalamove_status text,
add column if not exists lalamove_driver_id text,
add column if not exists lalamove_driver_name text,
add column if not exists lalamove_driver_phone text,
add column if not exists lalamove_tracking_url text;

-- Add comment for documentation
comment on column public.orders.delivery_fee is 'Delivery fee charged by Lalamove';
comment on column public.orders.lalamove_quotation_id is 'Lalamove quotation ID';
comment on column public.orders.lalamove_order_id is 'Lalamove order ID';
comment on column public.orders.lalamove_status is 'Current status of Lalamove delivery';
comment on column public.orders.lalamove_driver_id is 'Lalamove driver ID';
comment on column public.orders.lalamove_driver_name is 'Lalamove driver name';
comment on column public.orders.lalamove_driver_phone is 'Lalamove driver phone number';
comment on column public.orders.lalamove_tracking_url is 'Lalamove tracking URL for the delivery';

-- Add Lalamove configuration to tenants table
alter table public.tenants
add column if not exists lalamove_api_key text,
add column if not exists lalamove_secret_key text,
add column if not exists lalamove_market text,
add column if not exists lalamove_enabled boolean default false,
add column if not exists lalamove_service_type text,
add column if not exists lalamove_sandbox boolean default true;

-- Add comment for documentation
comment on column public.tenants.lalamove_api_key is 'Lalamove public API key';
comment on column public.tenants.lalamove_secret_key is 'Lalamove secret API key';
comment on column public.tenants.lalamove_market is 'Lalamove market code (e.g., HK, SG, TH)';
comment on column public.tenants.lalamove_enabled is 'Whether Lalamove delivery is enabled for this tenant';
comment on column public.tenants.lalamove_service_type is 'Lalamove service type (e.g., MOTORCYCLE, VAN, CAR)';
comment on column public.tenants.lalamove_sandbox is 'Whether to use Lalamove sandbox environment';

-- Add restaurant address fields to tenants (needed for Lalamove pickup)
alter table public.tenants
add column if not exists restaurant_address text,
add column if not exists restaurant_latitude numeric(10,8),
add column if not exists restaurant_longitude numeric(11,8);

-- Add comments for documentation
comment on column public.tenants.restaurant_address is 'Restaurant physical address for delivery pickup';
comment on column public.tenants.restaurant_latitude is 'Restaurant latitude coordinate';
comment on column public.tenants.restaurant_longitude is 'Restaurant longitude coordinate';

