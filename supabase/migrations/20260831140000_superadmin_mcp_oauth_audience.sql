CREATE OR REPLACE FUNCTION public.superadmin_mcp_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
BEGIN
  claims := event->'claims';

  IF claims->>'client_id' IS NOT NULL THEN
    event := jsonb_set(
      event,
      '{claims}',
      jsonb_set(claims, '{aud}', to_jsonb('https://www.webnegosyo.com/api/mcp/mcp'::text))
    );
  END IF;

  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.superadmin_mcp_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.superadmin_mcp_access_token_hook(jsonb) FROM authenticated, anon, public;
