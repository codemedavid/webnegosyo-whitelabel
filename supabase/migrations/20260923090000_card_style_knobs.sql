-- Card style knobs for the flexible storefront card templates
-- (showcase, atelier, kiosk, sticker, menuboard, arch — src/lib/card-style.ts).
--
-- One nullable scalar column per knob rather than a JSONB blob so the Branding
-- Studio's per-device `mobile_overrides` map (scalar values only) can override
-- any knob on phones. NULL and 'auto' both mean "use the template's design", so
-- every existing tenant renders exactly as before.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS card_image_ratio text
    CHECK (card_image_ratio IS NULL OR card_image_ratio IN ('auto', 'square', 'portrait', 'landscape', 'wide')),
  ADD COLUMN IF NOT EXISTS card_image_fit text
    CHECK (card_image_fit IS NULL OR card_image_fit IN ('auto', 'cover', 'contain')),
  ADD COLUMN IF NOT EXISTS card_add_button text
    CHECK (card_add_button IS NULL OR card_add_button IN ('auto', 'icon', 'pill', 'bar', 'hidden')),
  ADD COLUMN IF NOT EXISTS card_text_align text
    CHECK (card_text_align IS NULL OR card_text_align IN ('auto', 'start', 'center')),
  ADD COLUMN IF NOT EXISTS card_description text
    CHECK (card_description IS NULL OR card_description IN ('auto', 'show', 'hide')),
  ADD COLUMN IF NOT EXISTS card_density text
    CHECK (card_density IS NULL OR card_density IN ('auto', 'compact', 'comfortable', 'spacious'));

COMMENT ON COLUMN tenants.card_image_ratio IS 'Flexible card image shape: auto | square | portrait | landscape | wide';
COMMENT ON COLUMN tenants.card_image_fit IS 'Flexible card image fit: auto | cover | contain';
COMMENT ON COLUMN tenants.card_add_button IS 'Flexible card add button: auto | icon | pill | bar | hidden';
COMMENT ON COLUMN tenants.card_text_align IS 'Flexible card text alignment: auto | start | center';
COMMENT ON COLUMN tenants.card_description IS 'Flexible card description: auto | show | hide';
COMMENT ON COLUMN tenants.card_density IS 'Flexible card spacing: auto | compact | comfortable | spacious';
