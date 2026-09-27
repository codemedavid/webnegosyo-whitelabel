-- Retire the "compact" card template.
--
-- The storefront no longer ships a compact card; an unknown card_template
-- silently renders as Classic. Stores that chose compact (a horizontal row with
-- the photo beside the text) move to Menu Board, the closest surviving design
-- and a flexible template, so the card-style knobs now apply to them too.
--
-- Covers every place a card template is stored: the tenant column, the legacy
-- phone column, the phone override map, and per-category overrides.
--
-- Apply only AFTER the web build that ships `menuboard` is live: older builds
-- don't know it and would render these stores as Classic in the meantime.

UPDATE tenants
SET card_template = 'menuboard'
WHERE card_template = 'compact';

UPDATE tenants
SET mobile_card_template = 'menuboard'
WHERE mobile_card_template = 'compact';

UPDATE tenants
SET mobile_overrides = jsonb_set(mobile_overrides, '{card_template}', '"menuboard"')
WHERE mobile_overrides ->> 'card_template' = 'compact';

UPDATE categories
SET card_template = 'menuboard'
WHERE card_template = 'compact';
