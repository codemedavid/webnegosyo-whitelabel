-- Senior/PWD claims at ONLINE checkout become the owner's choice (off by default)
--
-- Until now any store with Tax & discounts set up showed a "Senior Citizen or
-- PWD?" form at web checkout: the customer typed a name and ID number and the
-- discount came off before anyone saw the card. Most stores want it given on
-- the register, after the staff check the ID, so online claims are now OFF
-- unless the owner switches them on in Settings → Tax & discounts.
--
-- The server enforces it (`priceCheckoutGovernment` refuses an online claim
-- while this is false); the checkout only shows a "show your ID" note.
--
-- Additive: one column with a default. Owner-only writes and the change log
-- come from the existing `store_tax_profiles` policies and triggers.

ALTER TABLE public.store_tax_profiles
  ADD COLUMN IF NOT EXISTS online_claims_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_tax_profiles.online_claims_enabled IS
  'false (default): Senior/PWD is applied on the register only. true: customers may claim it at online checkout.';

-- Rollback:
-- ALTER TABLE public.store_tax_profiles DROP COLUMN IF EXISTS online_claims_enabled;
