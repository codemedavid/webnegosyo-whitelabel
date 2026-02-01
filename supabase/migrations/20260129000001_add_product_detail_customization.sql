-- Product Detail Page Customization Migration
-- Created: 2026-01-29

-- Create product_detail_settings table
CREATE TABLE IF NOT EXISTS product_detail_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Page Background
  page_background_color text DEFAULT '#ffffff',
  page_background_gradient text, -- optional gradient CSS
  
  -- Header/Navigation
  header_background_color text,
  header_button_background_color text,
  header_button_icon_color text,
  
  -- Product Image Section
  image_background_color text DEFAULT '#f3f4f6',
  image_placeholder_color text DEFAULT '#9ca3af',
  sale_badge_background_color text DEFAULT '#ef4444',
  sale_badge_text_color text DEFAULT '#ffffff',
  
  -- Product Info Section
  product_name_color text DEFAULT '#111827',
  product_name_font_size text DEFAULT '24px',
  product_name_font_weight text DEFAULT '700',
  
  breadcrumb_color text,
  breadcrumb_active_color text,
  
  description_color text DEFAULT '#6b7280',
  description_font_size text DEFAULT '14px',
  
  -- Dietary Tags
  dietary_tag_background_color text,
  dietary_tag_text_color text,
  dietary_tag_border_color text,
  
  -- Variations Section
  variation_section_title_color text DEFAULT '#111827',
  variation_section_title_font_size text DEFAULT '16px',
  
  variation_option_background_color text DEFAULT '#f9fafb',
  variation_option_text_color text DEFAULT '#374151',
  variation_option_border_color text DEFAULT '#e5e7eb',
  variation_option_selected_background_color text,
  variation_option_selected_text_color text DEFAULT '#ffffff',
  variation_option_selected_border_color text,
  
  variation_price_modifier_color text DEFAULT '#6b7280',
  variation_required_badge_color text DEFAULT '#6b7280',
  
  -- Add-ons Section
  addon_section_title_color text DEFAULT '#111827',
  addon_section_title_font_size text DEFAULT '16px',
  
  addon_background_color text DEFAULT '#ffffff',
  addon_text_color text DEFAULT '#111827',
  addon_border_color text DEFAULT '#e5e7eb',
  addon_selected_background_color text,
  addon_selected_text_color text,
  addon_selected_border_color text,
  addon_selected_check_color text,
  addon_price_color text DEFAULT '#6b7280',
  addon_price_free_text text DEFAULT 'Free',
  
  -- Related Items Section
  related_section_title_color text DEFAULT '#111827',
  related_section_title_font_size text DEFAULT '18px',
  related_item_background_color text,
  related_item_name_color text DEFAULT '#111827',
  related_item_price_color text,
  
  -- Sticky Footer / Cart Bar
  footer_background_color text DEFAULT '#ffffff',
  footer_border_color text DEFAULT '#e5e7eb',
  footer_shadow_color text DEFAULT 'rgba(0,0,0,0.1)',
  
  summary_text_color text DEFAULT '#6b7280',
  total_price_color text DEFAULT '#111827',
  original_price_color text DEFAULT '#9ca3af',
  
  quantity_controls_background text DEFAULT '#f3f4f6',
  quantity_button_color text DEFAULT '#374151',
  quantity_text_color text DEFAULT '#111827',
  
  buy_now_button_background text,
  buy_now_button_text_color text,
  buy_now_button_border_color text,
  
  add_to_cart_button_background text,
  add_to_cart_button_text_color text DEFAULT '#ffffff',
  add_to_cart_button_shadow_color text DEFAULT 'rgba(0,0,0,0.1)',
  
  -- Image Modal
  modal_background_color text DEFAULT 'rgba(0,0,0,0.95)',
  modal_close_button_color text DEFAULT '#ffffff',
  modal_close_button_background text DEFAULT 'rgba(255,255,255,0.1)',
  
  -- Typography
  font_family_heading text,
  font_family_body text,
  
  -- Spacing
  section_padding text DEFAULT '24px',
  card_border_radius text DEFAULT '12px',
  button_border_radius text DEFAULT '9999px',
  
  -- Animation Settings
  enable_animations boolean DEFAULT true,
  animation_speed text DEFAULT 'normal', -- 'slow', 'normal', 'fast'
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(tenant_id)
);

-- Enable Row Level Security
ALTER TABLE product_detail_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Policy: Tenant admins can manage their own settings
CREATE POLICY "tenant_admins_manage_settings" ON product_detail_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
      AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = product_detail_settings.tenant_id))
    )
  );

-- Policy: Allow public read access (needed for customer-facing pages)
CREATE POLICY "public_read_settings" ON product_detail_settings
  FOR SELECT
  USING (true);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_detail_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS product_detail_settings_updated_at ON product_detail_settings;
CREATE TRIGGER product_detail_settings_updated_at
  BEFORE UPDATE ON product_detail_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_product_detail_settings_updated_at();

-- Create function to initialize settings when tenant is created
CREATE OR REPLACE FUNCTION initialize_product_detail_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_detail_settings (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create settings for new tenants
DROP TRIGGER IF EXISTS tenant_create_product_detail_settings ON tenants;
CREATE TRIGGER tenant_create_product_detail_settings
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION initialize_product_detail_settings();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_product_detail_settings_tenant_id 
  ON product_detail_settings(tenant_id);

-- Add comments for documentation
COMMENT ON TABLE product_detail_settings IS 'Stores customization settings for the product detail page per tenant';
COMMENT ON COLUMN product_detail_settings.page_background_color IS 'Main page background color';
COMMENT ON COLUMN product_detail_settings.product_name_color IS 'Product title text color';
COMMENT ON COLUMN product_detail_settings.variation_option_selected_background_color IS 'Selected variation option background - falls back to tenant primary color if null';
COMMENT ON COLUMN product_detail_settings.addon_selected_background_color IS 'Selected addon background - falls back to tenant primary color if null';
COMMENT ON COLUMN product_detail_settings.buy_now_button_background IS 'Buy Now button background - falls back to transparent with border if null';
COMMENT ON COLUMN product_detail_settings.add_to_cart_button_background IS 'Add to Cart button background - falls back to tenant primary color if null';
