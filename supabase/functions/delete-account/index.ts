import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Account deletion for the WebNegosyo merchant admin app (App Store guideline
// 5.1.1(v)). A signed-in merchant calls this from the in-app "Delete Account"
// flow. It deletes the caller's own auth identity and their app_users access
// rows. Tenant/business data (orders, menu, analytics) is intentionally
// preserved — other staff or the store owner may still rely on it.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server is not configured for account deletion." }, 500);
    }

    // Identify the caller from their own JWT (forwarded in the Authorization
    // header). This guarantees a user can only ever delete their own account.
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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Delete the auth identity FIRST. app_users.user_id is declared
    // ON DELETE CASCADE against auth.users, so removing the auth user also
    // removes the merchant's access row(s). Ordering it this way means a
    // transient failure leaves a fully intact, still-usable account the merchant
    // can simply retry — never a half-deleted "zombie" that can still sign in
    // but has lost the access row needed to reach the in-app delete flow.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
    const alreadyGone =
      !!deleteErr &&
      ((deleteErr as { status?: number }).status === 404 ||
        /not.?found/i.test(deleteErr.message));
    if (deleteErr && !alreadyGone) {
      return json({ error: `Failed to delete account: ${deleteErr.message}` }, 500);
    }

    // Defensive cleanup in case the FK cascade is ever changed; best-effort,
    // since the auth identity is already gone and can no longer sign in.
    await admin.from("app_users").delete().eq("user_id", user.id);

    return json({ success: true }, 200);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Unexpected server error." },
      500
    );
  }
});
