-- Facebook Pages Table
-- Stores Facebook Page connections for tenants
-- Allows tenants to connect their Facebook Pages for Messenger order notifications

CREATE TABLE IF NOT EXISTS public.facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  user_access_token TEXT, -- Long-lived user token for refreshing page token
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_facebook_pages_tenant ON public.facebook_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_page_id ON public.facebook_pages(page_id);

-- Auto-update timestamp
CREATE TRIGGER facebook_pages_set_updated_at
  BEFORE UPDATE ON public.facebook_pages
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.facebook_pages IS 
  'Stores Facebook Page connections for tenants. Each tenant can connect one or more Facebook Pages for Messenger order notifications.';
COMMENT ON COLUMN public.facebook_pages.page_id IS 
  'Facebook Page ID from Graph API';
COMMENT ON COLUMN public.facebook_pages.page_access_token IS 
  'Page Access Token for sending messages via Messenger API';
COMMENT ON COLUMN public.facebook_pages.user_access_token IS 
  'Long-lived user access token for refreshing page tokens when they expire';

-- Add optional foreign key reference to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS facebook_page_id UUID REFERENCES public.facebook_pages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.facebook_page_id IS 
  'Reference to the primary Facebook Page connected for this tenant';

