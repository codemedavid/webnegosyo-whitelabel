-- Owner AI assistant ("the Owl"): conversations, messages, proposed actions
-- and the per-store daily budget.
--
-- Access model: NOTHING here is readable or writable by anon or
-- authenticated. Chats are private to the person who had them (staff must not
-- read the owner's), and the budget is the spend cap, so every read and write
-- goes through the service role in /api/assistant/*, filtered by tenant_id AND
-- user_id after the server has checked the caller. RLS is enabled with no
-- policies on purpose (deny-all for every non-service role).
--
-- Writes the AI proposes never run from the chat: a propose_* tool stores the
-- validated payload in assistant_actions, and only the owner's Confirm tap
-- (a separate request, no model involved) executes the STORED payload with a
-- pending -> executing -> applied|failed compare-and-set.

-- 1. Conversations ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  -- Short refs the model sees (i12, c3) -> real ids. Server-side only.
  ref_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_owner
  ON public.assistant_conversations (tenant_id, user_id, updated_at DESC);

-- 2. Messages ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- The UI message id (AI SDK); unique per conversation.
  message_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  parts jsonb NOT NULL,
  model text,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
  ON public.assistant_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_tenant
  ON public.assistant_messages (tenant_id, created_at DESC);

-- 3. Proposed actions -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.assistant_conversations(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'bundle', 'upsell', 'menu_item', 'stock_adjustment', 'sms_campaign', 'voucher'
  )),
  -- Validated server-side; executed exactly as stored.
  payload jsonb NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'executing', 'applied', 'failed', 'cancelled', 'expired'
  )),
  result_ref text,
  error text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_actions_tenant
  ON public.assistant_actions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_actions_conversation
  ON public.assistant_actions (conversation_id);

-- 4. Daily budget -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assistant_usage_daily (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Business day in Asia/Manila.
  day date NOT NULL,
  messages integer NOT NULL DEFAULT 0 CHECK (messages >= 0),
  total_tokens bigint NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  PRIMARY KEY (tenant_id, day)
);

-- 5. Access -----------------------------------------------------------------

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_usage_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assistant_conversations FROM anon, authenticated;
REVOKE ALL ON public.assistant_messages FROM anon, authenticated;
REVOKE ALL ON public.assistant_actions FROM anon, authenticated;
REVOKE ALL ON public.assistant_usage_daily FROM anon, authenticated;
GRANT ALL ON public.assistant_conversations TO service_role;
GRANT ALL ON public.assistant_messages TO service_role;
GRANT ALL ON public.assistant_actions TO service_role;
GRANT ALL ON public.assistant_usage_daily TO service_role;

-- 6. Budget RPCs ------------------------------------------------------------

-- Atomically take one message from today's allowance. A single upsert whose
-- update only fires while the store is under BOTH caps, so two tabs at once
-- cannot both take the last message. Returns false when the day is used up.
CREATE OR REPLACE FUNCTION public.claim_assistant_turn(
  p_tenant_id uuid,
  p_max_messages integer,
  p_max_cost_usd numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_claimed boolean;
BEGIN
  IF p_max_messages < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.assistant_usage_daily AS u (tenant_id, day, messages)
  VALUES (p_tenant_id, v_day, 1)
  ON CONFLICT (tenant_id, day) DO UPDATE
    SET messages = u.messages + 1
    WHERE u.messages < p_max_messages
      AND u.cost_usd < p_max_cost_usd
  RETURNING true INTO v_claimed;

  RETURN coalesce(v_claimed, false);
END;
$$;

-- Add what a finished turn actually cost (tokens + USD from OpenRouter usage).
CREATE OR REPLACE FUNCTION public.record_assistant_usage(
  p_tenant_id uuid,
  p_tokens bigint,
  p_cost_usd numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.assistant_usage_daily AS u (tenant_id, day, total_tokens, cost_usd)
  VALUES (p_tenant_id, (now() AT TIME ZONE 'Asia/Manila')::date, greatest(p_tokens, 0), greatest(p_cost_usd, 0))
  ON CONFLICT (tenant_id, day) DO UPDATE
    SET total_tokens = u.total_tokens + greatest(p_tokens, 0),
        cost_usd = u.cost_usd + greatest(p_cost_usd, 0);
$$;

REVOKE ALL ON FUNCTION public.claim_assistant_turn(uuid, integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_assistant_usage(uuid, bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_assistant_turn(uuid, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_assistant_usage(uuid, bigint, numeric) TO service_role;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_assistant_usage(uuid, bigint, numeric);
--   DROP FUNCTION IF EXISTS public.claim_assistant_turn(uuid, integer, numeric);
--   DROP TABLE IF EXISTS public.assistant_usage_daily;
--   DROP TABLE IF EXISTS public.assistant_actions;
--   DROP TABLE IF EXISTS public.assistant_messages;
--   DROP TABLE IF EXISTS public.assistant_conversations;
