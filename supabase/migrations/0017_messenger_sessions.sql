-- Messenger Sessions Table
-- Stores user sessions for Facebook Messenger bot interactions

CREATE TABLE IF NOT EXISTS public.messenger_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psid TEXT UNIQUE NOT NULL,  -- Facebook Page-Scoped ID (unique per user)
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cart_data JSONB DEFAULT '[]'::jsonb,  -- Array of cart items
  checkout_state JSONB DEFAULT '{}'::jsonb,  -- Order type, customer data, payment method
  state TEXT DEFAULT 'menu' NOT NULL,  -- Current conversation state
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- State validation
  CONSTRAINT messenger_sessions_state_ck CHECK (
    state IN (
      'menu', 
      'selecting_item', 
      'selecting_variation', 
      'selecting_addons', 
      'selecting_quantity',
      'cart', 
      'checkout_order_type', 
      'checkout_customer', 
      'checkout_payment', 
      'checkout_confirm',
      'order_confirmed'
    )
  )
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_psid ON public.messenger_sessions(psid);
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_tenant ON public.messenger_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_state ON public.messenger_sessions(state);
CREATE INDEX IF NOT EXISTS idx_messenger_sessions_updated ON public.messenger_sessions(updated_at);

-- Auto-update timestamp
CREATE TRIGGER messenger_sessions_set_updated_at
  BEFORE UPDATE ON public.messenger_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.messenger_sessions IS 
  'Stores user sessions for Facebook Messenger bot, including cart and checkout state';
COMMENT ON COLUMN public.messenger_sessions.psid IS 
  'Facebook Page-Scoped ID - unique identifier for Messenger user';
COMMENT ON COLUMN public.messenger_sessions.cart_data IS 
  'JSON array of cart items with menu_item_id, quantity, variations, addons, price';
COMMENT ON COLUMN public.messenger_sessions.checkout_state IS 
  'JSON object storing checkout progress: order_type_id, customer_data, payment_method_id';
COMMENT ON COLUMN public.messenger_sessions.state IS 
  'Current conversation state: menu, selecting_item, selecting_variation, selecting_addons, selecting_quantity, cart, checkout_order_type, checkout_customer, checkout_payment, checkout_confirm, order_confirmed';

