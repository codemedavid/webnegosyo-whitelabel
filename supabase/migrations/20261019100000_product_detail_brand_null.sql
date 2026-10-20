-- Product page colours: a saved colour is the owner's pick, blank (NULL)
-- follows the store's brand.
--
-- These 18 columns had table defaults, so every row carried values the owner
-- never chose, and the page treated "equals the default" as "not chosen"
-- (mergeSettingsWithBranding's custom()). That made the default colours
-- impossible to pick: a dark store choosing a WHITE option, add-on, page or
-- footer background kept its brand colour (2026-10-19).
--
-- Behaviour-preserving for the live code: a stored default already rendered
-- as the brand colour, and NULL renders as the brand colour under both the old
-- and the new rule. Apply BEFORE deploying the code that honours any saved
-- value, or stores' stored defaults would briefly paint over their brand.

alter table public.product_detail_settings
  alter column addon_background_color drop default,
  alter column addon_text_color drop default,
  alter column page_background_color drop default,
  alter column product_name_color drop default,
  alter column description_color drop default,
  alter column variation_section_title_color drop default,
  alter column variation_option_background_color drop default,
  alter column variation_option_text_color drop default,
  alter column variation_option_border_color drop default,
  alter column addon_section_title_color drop default,
  alter column addon_border_color drop default,
  alter column related_section_title_color drop default,
  alter column related_item_name_color drop default,
  alter column footer_background_color drop default,
  alter column footer_border_color drop default,
  alter column summary_text_color drop default,
  alter column total_price_color drop default,
  alter column original_price_color drop default;

update public.product_detail_settings set
  addon_background_color = nullif(addon_background_color, '#ffffff'),
  addon_text_color = nullif(addon_text_color, '#111827'),
  page_background_color = nullif(page_background_color, '#ffffff'),
  product_name_color = nullif(product_name_color, '#111827'),
  description_color = nullif(description_color, '#6b7280'),
  variation_section_title_color = nullif(variation_section_title_color, '#111827'),
  variation_option_background_color = nullif(variation_option_background_color, '#f9fafb'),
  variation_option_text_color = nullif(variation_option_text_color, '#374151'),
  variation_option_border_color = nullif(variation_option_border_color, '#e5e7eb'),
  addon_section_title_color = nullif(addon_section_title_color, '#111827'),
  addon_border_color = nullif(addon_border_color, '#e5e7eb'),
  related_section_title_color = nullif(related_section_title_color, '#111827'),
  related_item_name_color = nullif(related_item_name_color, '#111827'),
  footer_background_color = nullif(footer_background_color, '#ffffff'),
  footer_border_color = nullif(footer_border_color, '#e5e7eb'),
  summary_text_color = nullif(summary_text_color, '#6b7280'),
  total_price_color = nullif(total_price_color, '#111827'),
  original_price_color = nullif(original_price_color, '#9ca3af')
where addon_background_color = '#ffffff'
   or addon_text_color = '#111827'
   or page_background_color = '#ffffff'
   or product_name_color = '#111827'
   or description_color = '#6b7280'
   or variation_section_title_color = '#111827'
   or variation_option_background_color = '#f9fafb'
   or variation_option_text_color = '#374151'
   or variation_option_border_color = '#e5e7eb'
   or addon_section_title_color = '#111827'
   or addon_border_color = '#e5e7eb'
   or related_section_title_color = '#111827'
   or related_item_name_color = '#111827'
   or footer_background_color = '#ffffff'
   or footer_border_color = '#e5e7eb'
   or summary_text_color = '#6b7280'
   or total_price_color = '#111827'
   or original_price_color = '#9ca3af';
