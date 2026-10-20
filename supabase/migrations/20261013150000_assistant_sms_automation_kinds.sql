-- Owner assistant: SMS automation proposals (create/edit — saved Off; switch
-- on/off; run now). Still two-phase: only the owner's Confirm tap executes
-- the stored payload. Additive only — every existing kind stays valid.

ALTER TABLE public.assistant_actions DROP CONSTRAINT IF EXISTS assistant_actions_kind_check;

ALTER TABLE public.assistant_actions ADD CONSTRAINT assistant_actions_kind_check CHECK (kind IN (
  'bundle', 'upsell', 'menu_item', 'stock_adjustment', 'sms_campaign', 'voucher',
  'offer_change', 'last_call', 'loyalty_program', 'loyalty_status',
  'campaign_status', 'voucher_status', 'menu_item_change', 'menu_import',
  'sms_automation', 'sms_automation_status', 'sms_automation_run'
));
