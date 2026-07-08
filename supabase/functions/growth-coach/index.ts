import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// AI Growth Coach for the WebNegosyo merchant app. A signed-in merchant POSTs a
// PII-free snapshot of their store's numbers (built client-side in
// lib/growth-coach.ts); this function wraps it in an Alex Hormozi–style scaling
// prompt and streams OpenRouter's reply back token-by-token. The OpenRouter key
// never leaves the server — the device only ever talks to this function with
// its own Supabase JWT. Mirrors the delete-account function for auth/CORS and
// the web app's parse-menu route for the OpenRouter streaming call.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Merchant-provided model; overridable per-deployment. Falls back to a known
// stable model if the primary id is rejected (e.g. renamed/unavailable).
const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it";
const FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct";
const MAX_TOKENS = 900;
// The facts snapshot is small (~1–2 KB). Cap generously so an authenticated
// client can't inflate token spend with an oversized payload.
const MAX_FACTS_BYTES = 16_000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are the WebNegosyo Growth Coach — a no-nonsense restaurant-scaling advisor with the voice and mental models of Alex Hormozi. You help small Filipino restaurant and food-business owners scale. You are direct, punchy, encouraging, and specific. Light Taglish is welcome. You never invent numbers.

You reason with one equation: Revenue = Customers × Purchase Frequency × Average Ticket, and Profit = Revenue × Margin. There are exactly four levers to pull:
1. RAISE MARGIN — increase prices and/or lower cost. More money kept per sale.
2. SELL MORE PER CUSTOMER — upsells, bundles, order bumps, "make it a meal" upgrades. Bigger ticket.
3. GET MORE CUSTOMERS — local marketing, Messenger/FB promos, QR table tents, referral offers, reviews.
4. NEW TRAFFIC CHANNELS — convert dine-in customers into online-delivery customers, and run online-delivery ads.

You are given a DATA snapshot in JSON. It includes a "bottleneck" the app already computed (customers | aov | margin | healthy | no-data) and the exact numbers behind it. Do this:
- Open with the single biggest constraint, named plainly, and the ONE lever that fixes it fastest.
- SHOW THE MATH using their real numbers and their target. Spell out the two concrete paths to the target: (a) more orders/day, and (b) a higher average ticket at today's volume — using gapToTarget.additionalOrdersPerDay and gapToTarget.aovNeededAtCurrentVolume.
- Give 3–5 specific, do-it-this-week actions tuned to the bottleneck. If the constraint is ticket size, lean on bundles/upsells (mention their top products by name when useful). If it's customers, lean on acquisition and channels. If it's margin, lean on repricing and cost.
- Only recommend features that fit: if bundles/menu-engineering are enabled, suggest using them; if not, suggest simpler manual tactics.
- If hasData is false or the numbers are too thin, say so honestly and tell them the 2–3 things to start tracking first. Do not fabricate figures.
- Keep it tight — a few short sections, scannable, no fluff. Format with short markdown headers and bullet points.
- ALWAYS end with exactly this call to action on its own line: "**Want a plan built around your exact numbers? DM us on WebNegosyo for a free 1:1 consultation.**"

All money is Philippine pesos (₱).`;

function buildUserMessage(facts: unknown): string {
  return `Here is the store's DATA snapshot. Read it and give me my scaling plan.\n\n${JSON.stringify(facts, null, 2)}`;
}

/** Minimal boundary validation — the payload comes from our own client, but we
 * never trust external data. Confirms the shape the prompt depends on. */
function isValidFacts(body: unknown): body is { targetMonthlyRevenue: number; actual: unknown } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const target = b.targetMonthlyRevenue;
  return typeof target === "number" && Number.isFinite(target) && target > 0 &&
    typeof b.actual === "object" && b.actual !== null;
}

// The OpenRouter key lives in Supabase Vault (not an edge-function env secret)
// so it can be provisioned entirely via SQL/MCP. We read it server-side with
// the service-role client through a locked-down SECURITY DEFINER accessor
// (public.growth_coach_openrouter_key, granted to service_role only). A plain
// OPENROUTER_API_KEY env var still wins if one is ever set. Cached per instance
// so we only hit the DB on the first request an instance serves.
let cachedOpenrouterKey: string | null = null;

async function resolveOpenrouterKey(
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
): Promise<string> {
  const envKey = Deno.env.get("OPENROUTER_API_KEY");
  if (envKey) return envKey;
  if (cachedOpenrouterKey) return cachedOpenrouterKey;
  if (!serviceRoleKey) return "";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("growth_coach_openrouter_key");
  if (error || typeof data !== "string" || data.length === 0) {
    if (error) console.error("[growth-coach] vault key lookup failed:", error.message);
    return "";
  }
  cachedOpenrouterKey = data;
  return data;
}

async function callOpenRouter(apiKey: string, model: string, facts: unknown) {
  return await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://webnegosyo.com",
      "X-Title": "WebNegosyo Growth Coach",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(facts) },
      ],
      temperature: 0.6,
      max_tokens: MAX_TOKENS,
      stream: true,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey) {
      return json({ error: "Server is not configured." }, 500);
    }

    // Identify the caller from their own JWT so only signed-in merchants can
    // spend AI tokens. Demo sessions have no JWT and are blocked here (the app
    // gates the coach behind real login before it ever reaches this function).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Invalid or expired session." }, 401);
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_FACTS_BYTES) {
      return json({ error: "Request payload too large." }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
    if (!isValidFacts(body)) {
      return json({ error: "Invalid or incomplete growth data." }, 400);
    }

    // Resolve the key only after the caller is authenticated and the payload is
    // valid, so unauthenticated/garbage requests never trigger a Vault lookup.
    const openrouterKey = await resolveOpenrouterKey(supabaseUrl, serviceRoleKey);
    if (!openrouterKey) {
      return json({ error: "AI coach is not configured. Please contact support." }, 500);
    }

    const model = Deno.env.get("GROWTH_COACH_MODEL") ?? DEFAULT_MODEL;

    let response = await callOpenRouter(openrouterKey, model, body);

    // If the primary model id is rejected (renamed/unavailable), retry once with
    // a known-stable fallback so the coach still answers.
    if (!response.ok && response.status === 400 && model !== FALLBACK_MODEL) {
      console.warn(`[growth-coach] model "${model}" rejected; retrying with ${FALLBACK_MODEL}`);
      response = await callOpenRouter(openrouterKey, FALLBACK_MODEL, body);
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      console.error("[growth-coach] OpenRouter error:", response.status, detail);
      return json({ error: "The AI coach is busy right now. Please try again." }, 502);
    }

    // Pass OpenRouter's SSE stream straight through. The client parses the
    // `data:` lines exactly like the web app's menu parser does.
    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("[growth-coach] unexpected error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Unexpected server error." },
      500,
    );
  }
});
