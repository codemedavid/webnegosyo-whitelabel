-- Add messenger_redirect_enabled toggle to tenants.
-- Controls whether the checkout flow automatically redirects the customer to
-- Messenger after an order is placed.
--   true  (default) = auto-open Messenger after checkout (historical behavior)
--   false           = stay on the confirmation screen; customer sends manually
-- Existing rows default to true so behavior is unchanged for current tenants.

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS messenger_redirect_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.messenger_redirect_enabled IS
'When true, checkout auto-opens Messenger after an order is placed; when false, the redirect is suppressed and the customer sends the order message manually.';
