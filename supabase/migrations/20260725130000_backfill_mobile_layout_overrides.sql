-- Backfill the legacy per-device layout columns into the Branding Studio's
-- mobile_overrides map.
--
-- The old branding editor wrote mobile_page_layout / mobile_card_template /
-- mobile_header_template columns. The Studio edits the mobile_overrides JSONB
-- map instead and cannot see those columns, so a tenant carrying legacy values
-- saw a mobile storefront the Studio panel could neither show nor change.
--
-- The runtime keeps reading the legacy columns as a fallback (see
-- resolveStorefrontLayout), so this backfill changes no rendered output — it
-- only makes the Studio's mobile tab display and edit the value the phone
-- actually renders. Idempotent: an existing override key is never overwritten.

UPDATE tenants
SET mobile_overrides = COALESCE(mobile_overrides, '{}'::jsonb)
  || CASE
       WHEN mobile_page_layout IS NOT NULL
        AND mobile_page_layout <> ''
        AND mobile_page_layout <> 'inherit'
        AND NOT (COALESCE(mobile_overrides, '{}'::jsonb) ? 'page_layout')
       THEN jsonb_build_object('page_layout', mobile_page_layout)
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN mobile_card_template IS NOT NULL
        AND mobile_card_template <> ''
        AND mobile_card_template <> 'inherit'
        AND NOT (COALESCE(mobile_overrides, '{}'::jsonb) ? 'card_template')
       THEN jsonb_build_object('card_template', mobile_card_template)
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN mobile_header_template IS NOT NULL
        AND mobile_header_template <> ''
        AND mobile_header_template <> 'inherit'
        AND NOT (COALESCE(mobile_overrides, '{}'::jsonb) ? 'header_template')
       THEN jsonb_build_object('header_template', mobile_header_template)
       ELSE '{}'::jsonb
     END
WHERE mobile_page_layout IS NOT NULL
   OR mobile_card_template IS NOT NULL
   OR mobile_header_template IS NOT NULL;
