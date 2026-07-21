-- SmartMenu MCP API keys
-- Bearer credentials that let an external AI (Claude/ChatGPT) drive the
-- superadmin admin API without a Supabase session cookie. Only the SHA-256
-- hash of each key is stored; the plaintext is shown to the operator once at
-- creation time and never persisted. Verification (see src/lib/mcp-auth.ts)
-- runs on the service-role client, which bypasses RLS. The RLS policies below
-- exist only to keep the cookie-based superadmin UI (mint/list/revoke) safe and
-- to deny all access to anon/public clients — key_hash must never leak.

-- ============================================
-- 1. mcp_api_keys table
-- ============================================

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 hex digest of the plaintext key. Unique so a key maps to one row.
  key_hash TEXT NOT NULL UNIQUE,
  -- Non-secret display prefix (e.g. "smk_live_") plus a human label.
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Coarse capability scopes; ['superadmin'] grants the full admin API.
  scopes TEXT[] NOT NULL DEFAULT ARRAY['superadmin'],
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE mcp_api_keys IS
  'Bearer credentials for the SmartMenu MCP admin API. Stores only the SHA-256 hash of each key; verified via service-role client in src/lib/mcp-auth.ts.';

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_key_hash ON mcp_api_keys(key_hash);

-- ============================================
-- 2. RLS — superadmin-only; anon/public fully denied
-- ============================================

ALTER TABLE mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- Superadmins (cookie session) can mint, list, and revoke keys.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_api_keys' AND policyname = 'Superadmins can manage mcp api keys') THEN
    CREATE POLICY "Superadmins can manage mcp api keys" ON mcp_api_keys
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM app_users au
          WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
        )
      );
  END IF;
END $$;
