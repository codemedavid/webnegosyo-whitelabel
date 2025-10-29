-- Extended Branding Colors Migration
-- Adds comprehensive branding options for tenants

-- Add new branding columns to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS background_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS header_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS header_font_color text DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS cards_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS cards_border_color text DEFAULT '#e5e7eb',
ADD COLUMN IF NOT EXISTS button_primary_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS button_primary_text_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS button_secondary_color text DEFAULT '#f3f4f6',
ADD COLUMN IF NOT EXISTS button_secondary_text_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS text_primary_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS text_secondary_color text DEFAULT '#6b7280',
ADD COLUMN IF NOT EXISTS text_muted_color text DEFAULT '#9ca3af',
ADD COLUMN IF NOT EXISTS border_color text DEFAULT '#e5e7eb',
ADD COLUMN IF NOT EXISTS success_color text DEFAULT '#10b981',
ADD COLUMN IF NOT EXISTS warning_color text DEFAULT '#f59e0b',
ADD COLUMN IF NOT EXISTS error_color text DEFAULT '#ef4444',
ADD COLUMN IF NOT EXISTS link_color text DEFAULT '#3b82f6',
ADD COLUMN IF NOT EXISTS shadow_color text DEFAULT 'rgba(0, 0, 0, 0.1)';

-- Update existing tenants with default values if they don't have them
UPDATE public.tenants 
SET 
  background_color = COALESCE(background_color, '#ffffff'),
  header_color = COALESCE(header_color, '#ffffff'),
  header_font_color = COALESCE(header_font_color, '#000000'),
  cards_color = COALESCE(cards_color, '#ffffff'),
  cards_border_color = COALESCE(cards_border_color, '#e5e7eb'),
  button_primary_color = COALESCE(button_primary_color, primary_color),
  button_primary_text_color = COALESCE(button_primary_text_color, '#ffffff'),
  button_secondary_color = COALESCE(button_secondary_color, '#f3f4f4'),
  button_secondary_text_color = COALESCE(button_secondary_text_color, '#111111'),
  text_primary_color = COALESCE(text_primary_color, '#111111'),
  text_secondary_color = COALESCE(text_secondary_color, '#6b7280'),
  text_muted_color = COALESCE(text_muted_color, '#9ca3af'),
  border_color = COALESCE(border_color, '#e5e7eb'),
  success_color = COALESCE(success_color, '#10b981'),
  warning_color = COALESCE(warning_color, '#f59e0b'),
  error_color = COALESCE(error_color, '#ef4444'),
  link_color = COALESCE(link_color, '#3b82f6'),
  shadow_color = COALESCE(shadow_color, 'rgba(0, 0, 0, 0.1)')
WHERE background_color IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.tenants.background_color IS 'Main background color for the application';
COMMENT ON COLUMN public.tenants.header_color IS 'Header/navigation background color';
COMMENT ON COLUMN public.tenants.header_font_color IS 'Header text color';
COMMENT ON COLUMN public.tenants.cards_color IS 'Card background color';
COMMENT ON COLUMN public.tenants.cards_border_color IS 'Card border color';
COMMENT ON COLUMN public.tenants.button_primary_color IS 'Primary button background color';
COMMENT ON COLUMN public.tenants.button_primary_text_color IS 'Primary button text color';
COMMENT ON COLUMN public.tenants.button_secondary_color IS 'Secondary button background color';
COMMENT ON COLUMN public.tenants.button_secondary_text_color IS 'Secondary button text color';
COMMENT ON COLUMN public.tenants.text_primary_color IS 'Primary text color';
COMMENT ON COLUMN public.tenants.text_secondary_color IS 'Secondary text color';
COMMENT ON COLUMN public.tenants.text_muted_color IS 'Muted text color';
COMMENT ON COLUMN public.tenants.border_color IS 'General border color';
COMMENT ON COLUMN public.tenants.success_color IS 'Success state color';
COMMENT ON COLUMN public.tenants.warning_color IS 'Warning state color';
COMMENT ON COLUMN public.tenants.error_color IS 'Error state color';
COMMENT ON COLUMN public.tenants.link_color IS 'Link color';
COMMENT ON COLUMN public.tenants.shadow_color IS 'Shadow color';
