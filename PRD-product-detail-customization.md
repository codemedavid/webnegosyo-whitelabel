# Product Detail Page Customization PRD

## Overview
Enable tenant admins to fully customize the product detail page appearance through a live editor overlay. All visual elements should be customizable including colors, typography, spacing, and component-specific styles.

## Goals
- Allow real-time preview of customization changes
- Persist customization settings per tenant
- Apply customizations dynamically to product detail page
- Maintain fallback to global branding when not customized

## Database Schema Changes

### New Table: `product_detail_settings`
```sql
create table product_detail_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  
  -- Page Background
  page_background_color text default '#ffffff',
  page_background_gradient text, -- optional gradient CSS
  
  -- Header/Navigation
  header_background_color text,
  header_button_background_color text,
  header_button_icon_color text,
  
  -- Product Image Section
  image_background_color text default '#f3f4f6',
  image_placeholder_color text default '#9ca3af',
  sale_badge_background_color text default '#ef4444',
  sale_badge_text_color text default '#ffffff',
  
  -- Product Info Section
  product_name_color text default '#111827',
  product_name_font_size text default '24px',
  product_name_font_weight text default '700',
  
  breadcrumb_color text,
  breadcrumb_active_color text,
  
  description_color text default '#6b7280',
  description_font_size text default '14px',
  
  -- Dietary Tags
  dietary_tag_background_color text,
  dietary_tag_text_color text,
  dietary_tag_border_color text,
  
  -- Variations Section
  variation_section_title_color text default '#111827',
  variation_section_title_font_size text default '16px',
  
  variation_option_background_color text default '#f9fafb',
  variation_option_text_color text default '#374151',
  variation_option_border_color text default '#e5e7eb',
  variation_option_selected_background_color text,
  variation_option_selected_text_color text default '#ffffff',
  variation_option_selected_border_color text,
  
  variation_price_modifier_color text default '#6b7280',
  variation_required_badge_color text default '#6b7280',
  
  -- Add-ons Section
  addon_section_title_color text default '#111827',
  addon_section_title_font_size text default '16px',
  
  addon_background_color text default '#ffffff',
  addon_text_color text default '#111827',
  addon_border_color text default '#e5e7eb',
  addon_selected_background_color text,
  addon_selected_text_color text,
  addon_selected_border_color text,
  addon_selected_check_color text,
  addon_price_color text default '#6b7280',
  addon_price_free_text text default 'Free',
  
  -- Related Items Section
  related_section_title_color text default '#111827',
  related_section_title_font_size text default '18px',
  related_item_background_color text,
  related_item_name_color text default '#111827',
  related_item_price_color text,
  
  -- Sticky Footer / Cart Bar
  footer_background_color text default '#ffffff',
  footer_border_color text default '#e5e7eb',
  footer_shadow_color text default 'rgba(0,0,0,0.1)',
  
  summary_text_color text default '#6b7280',
  total_price_color text default '#111827',
  original_price_color text default '#9ca3af',
  
  quantity_controls_background text default '#f3f4f6',
  quantity_button_color text default '#374151',
  quantity_text_color text default '#111827',
  
  buy_now_button_background text,
  buy_now_button_text_color text,
  buy_now_button_border_color text,
  
  add_to_cart_button_background text,
  add_to_cart_button_text_color text default '#ffffff',
  add_to_cart_button_shadow_color text default 'rgba(0,0,0,0.1)',
  
  -- Image Modal
  modal_background_color text default 'rgba(0,0,0,0.95)',
  modal_close_button_color text default '#ffffff',
  modal_close_button_background text default 'rgba(255,255,255,0.1)',
  
  -- Typography
  font_family_heading text,
  font_family_body text,
  
  -- Spacing
  section_padding text default '24px',
  card_border_radius text default '12px',
  button_border_radius text default '9999px',
  
  -- Animation Settings
  enable_animations boolean default true,
  animation_speed text default 'normal', -- 'slow', 'normal', 'fast'
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(tenant_id)
);

-- Enable RLS
alter table product_detail_settings enable row level security;

-- RLS Policies
CREATE POLICY "tenant_admins_full_access" ON product_detail_settings
  USING (EXISTS (
    SELECT 1 FROM tenant_users 
    WHERE tenant_users.tenant_id = product_detail_settings.tenant_id 
    AND tenant_users.user_id = auth.uid()
    AND tenant_users.role IN ('admin', 'owner', 'super_admin')
  ));

CREATE POLICY "public_read_access" ON product_detail_settings
  FOR SELECT USING (true);
```

## API Changes

### New Server Action: `saveProductDetailSettings`
- Save customization settings to database
- Validate color formats
- Update `updated_at` timestamp

### New Server Action: `getProductDetailSettings`
- Fetch settings for a tenant
- Return merged with global branding fallbacks

### New Hook: `useProductDetailTheme`
- Merge global branding with product detail specific settings
- Compute CSS variables dynamically
- Provide helper functions for style application

## UI Components

### ProductDetailCustomizer Component
- Floating action button to open editor
- Slide-out panel or modal with customization options
- Real-time preview of changes
- Sections organized by UI area:
  - Page Layout
  - Header & Navigation
  - Product Image
  - Product Info
  - Variations
  - Add-ons
  - Related Items
  - Cart Footer
  - Typography
  - Animations

### ColorPicker Component
- Hex color input
- Preset color palette
- Color picker popup
- "Reset to default" option

### LivePreview Component
- Renders actual product detail page
- Applies current customization settings
- Updates in real-time as admin changes settings

## Implementation Plan

### Phase 1: Database & API
1. Create migration file
2. Create server actions
3. Create useProductDetailTheme hook

### Phase 2: Admin UI
1. Create ProductDetailCustomizer component
2. Create color picker and form components
3. Add live preview functionality

### Phase 3: Product Detail Page Updates
1. Update product-detail-content.tsx to use dynamic theming
2. Apply CSS variables from settings
3. Add animation controls

### Phase 4: Testing
1. Unit tests for hook and utilities
2. Integration tests for settings save/load
3. Visual regression tests

## Acceptance Criteria
- [ ] Admin can open customization panel from product detail page
- [ ] All color values can be customized with live preview
- [ ] Typography settings (font family, size, weight) work
- [ ] Spacing and border radius settings apply correctly
- [ ] Animation enable/disable toggle works
- [ ] Changes persist after page refresh
- [ ] Reset to defaults button works
- [ ] Settings apply only to product detail page
- [ ] Global branding used as fallback for unset values
- [ ] Mobile and desktop views both customizable
