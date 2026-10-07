-- Owner assistant: proposals that manage what already exists (offers, the
-- cart's last call, loyalty programs, SMS campaigns, vouchers, dish price and
-- availability), and dishes read from menu photos. Still two-phase: the Confirm tap executes the stored payload.
-- Additive only — every existing kind stays valid.

ALTER TABLE public.assistant_actions DROP CONSTRAINT IF EXISTS assistant_actions_kind_check;

ALTER TABLE public.assistant_actions ADD CONSTRAINT assistant_actions_kind_check CHECK (kind IN (
  'bundle', 'upsell', 'menu_item', 'stock_adjustment', 'sms_campaign', 'voucher',
  'offer_change', 'last_call', 'loyalty_program', 'loyalty_status',
  'campaign_status', 'voucher_status', 'menu_item_change', 'menu_import'
));
