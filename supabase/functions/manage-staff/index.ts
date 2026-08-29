import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  handleStaffAction,
  type StaffActionContext,
  type StaffActionRequest,
  type StaffCaller,
  type StaffCoreStore,
  type StaffRecord,
} from "./staff-core.ts";

// Staff management for the WebNegosyo merchant admin app. The app cannot hold
// the service-role key, so the owner (or a branch admin holding branch_staff)
// calls this from the in-app Team screen. Every decision — who may act, on
// whom, within which branch, under what seat allowance — is made by the pure
// core in staff-core.ts, which the web Jest suite pins to the web originals.
// This file only wires it up: identify the caller from their JWT, load THEIR
// app_users row (the tenant always comes from that row, never from the request
// body), gather branches and the plan allowance, and run the requested action
// with the service-role client.

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

const STAFF_COLUMNS =
  "user_id, tenant_id, role, is_owner, outlet_id, permissions, display_name, email, default_tab, created_at";

function makeSupabaseStore(admin: SupabaseClient): StaffCoreStore {
  return {
    listStaff: async (tenantId) => {
      const { data, error } = await admin
        .from("app_users")
        .select(STAFF_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("role", "admin")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StaffRecord[];
    },
    createAuthUser: async ({ email, password }) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(error?.message ?? "Failed to create the staff account");
      }
      return { userId: data.user.id };
    },
    insertStaffRow: async (row) => {
      const { error } = await admin.from("app_users").insert({
        user_id: row.user_id,
        role: row.role,
        tenant_id: row.tenant_id,
        is_owner: row.is_owner,
        outlet_id: row.outlet_id ?? null,
        permissions: row.permissions,
        display_name: row.display_name,
        email: row.email,
        default_tab: row.default_tab ?? null,
      });
      if (error) {
        // Don't leave an orphaned auth user behind if the row insert fails.
        await admin.auth.admin.deleteUser(row.user_id).catch(() => undefined);
        throw new Error(error.message);
      }
    },
    updateStaffRow: async (userId, patch) => {
      const { error } = await admin
        .from("app_users")
        .update(patch)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    deleteAuthUser: async (userId) => {
      // FK on app_users.user_id cascades, removing the staff row too.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    },
    updateAuthPassword: async (userId, password) => {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
      });
      if (error) throw new Error(error.message);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Missing authorization header." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(
        { success: false, error: "Server is not configured for staff management." },
        500,
      );
    }

    // Identify the caller from their own JWT.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ success: false, error: "Invalid or expired session." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The caller's own access row is the sole source of tenant and authority.
    const { data: callerRow, error: callerErr } = await admin
      .from("app_users")
      .select("user_id, tenant_id, role, is_owner, outlet_id, permissions")
      .eq("user_id", user.id)
      .maybeSingle();
    if (callerErr) {
      return json({ success: false, error: callerErr.message }, 500);
    }
    if (!callerRow || !callerRow.tenant_id) {
      return json({ success: false, error: "No store access for this account." }, 403);
    }
    const caller = callerRow as unknown as StaffCaller;

    // Branches for assignment validation, and the seat allowance from the
    // tenant's plan. The allowance must come from the row — it is the
    // enforcement, and a failed read falls back to the platform default
    // inside the core, never to unlimited.
    const [outletsRes, tenantRes] = await Promise.all([
      admin.from("outlets").select("id").eq("tenant_id", caller.tenant_id),
      admin
        .from("tenants")
        .select("max_staff_per_branch")
        .eq("id", caller.tenant_id)
        .maybeSingle(),
    ]);
    if (outletsRes.error) {
      return json({ success: false, error: outletsRes.error.message }, 500);
    }
    const context: StaffActionContext = {
      outlets: (outletsRes.data ?? []) as { id: string }[],
      maxStaffPerBranch:
        (tenantRes.data as { max_staff_per_branch?: number | null } | null)
          ?.max_staff_per_branch ?? undefined,
    };

    const request = (await req.json().catch(() => null)) as
      | StaffActionRequest
      | null;
    if (!request || typeof request !== "object" || !("action" in request)) {
      return json({ success: false, error: "A JSON body with an action is required." }, 400);
    }

    const result = await handleStaffAction(
      makeSupabaseStore(admin),
      caller,
      context,
      request,
    );
    return json(result.body, result.status);
  } catch (e) {
    return json(
      { success: false, error: e instanceof Error ? e.message : "Unexpected server error." },
      500,
    );
  }
});
