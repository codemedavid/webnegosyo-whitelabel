-- SmartMenu MCP OAuth 2.1 authorization-server tables
--
-- Backs the "automatic login" connect flow: Claude/ChatGPT register as public
-- clients (DCR), a superadmin authorizes in the browser, and the token endpoint
-- issues a stateless HS256 access token plus an opaque refresh token. Only the
-- SHA-256 hash of authorization codes and refresh tokens is stored. Access
-- tokens are NOT stored (stateless JWT). All access runs through the service-role
-- client (see src/lib/mcp/oauth-service.ts), which bypasses RLS; the RLS below
-- exists to deny anon/public clients — hashes must never leak.

-- ============================================
-- 1. Registered OAuth clients (DCR)
-- ============================================

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE mcp_oauth_clients IS
  'Public OAuth clients (Claude/ChatGPT) registered via Dynamic Client Registration for the SmartMenu MCP.';

-- ============================================
-- 2. Authorization codes (single-use, short-lived, PKCE-bound)
-- ============================================

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  scope TEXT NOT NULL DEFAULT 'superadmin',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE mcp_oauth_codes IS
  'Single-use, PKCE-bound authorization codes for the MCP OAuth flow. Stores only the SHA-256 hash of each code.';

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_code_hash ON mcp_oauth_codes(code_hash);

-- ============================================
-- 3. Refresh tokens (revocable)
-- ============================================

CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  subject UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'superadmin',
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE mcp_oauth_tokens IS
  'Opaque refresh tokens for the MCP OAuth flow. Stores only the SHA-256 hash; revoke by stamping revoked_at.';

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_token_hash ON mcp_oauth_tokens(token_hash);

-- ============================================
-- 4. RLS — deny anon/public; service-role bypasses by design
-- ============================================

ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Superadmins (cookie session) may inspect/manage registered clients + tokens
-- from a future admin UI. Codes are never exposed to the UI.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_oauth_clients' AND policyname = 'Superadmins can manage mcp oauth clients') THEN
    CREATE POLICY "Superadmins can manage mcp oauth clients" ON mcp_oauth_clients
      FOR ALL USING (
        EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_oauth_tokens' AND policyname = 'Superadmins can manage mcp oauth tokens') THEN
    CREATE POLICY "Superadmins can manage mcp oauth tokens" ON mcp_oauth_tokens
      FOR ALL USING (
        EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin')
      );
  END IF;
END $$;
