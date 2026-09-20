/**
 * The one manage-staff transport the app talks through.
 *
 * Built once, here, because more than one screen now manages staff (the Team
 * directory and a person's own screen) and a second hand-rolled invoke is how
 * one of them ends up back on the supabase-js functions client — whose fetch
 * wrapper awaits the session with no deadline and reports a hung session read,
 * a dropped socket and a dead network all as "Failed to send a request to the
 * Edge Function". See `manage-staff-transport.ts`.
 *
 * A superadmin viewing a store has no store of its own, so the viewed tenant
 * travels with each request; `withTenantScope` attaches it and is a no-op for
 * everyone else.
 */

import { useMemo } from "react";

import { createManageStaffInvoke } from "./manage-staff-transport";
import { withTenantScope, type ManageStaffInvoke } from "./staff-service";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import { useAuthStore } from "../stores/auth-store";

const invokeManageStaffRaw: ManageStaffInvoke = createManageStaffInvoke({
  functionsUrl: `${supabaseUrl.replace(/\/$/, "")}/functions/v1`,
  anonKey: supabaseAnonKey,
  getSession: () => supabase.auth.getSession(),
  fetchImpl: fetch,
});

/** The invoke to hand every `lib/staff-service` call on this screen. */
export function useManageStaff(): ManageStaffInvoke {
  const impersonatedTenantId = useAuthStore((state) => state.impersonatedTenantId);
  return useMemo(() => withTenantScope(invokeManageStaffRaw, impersonatedTenantId), [impersonatedTenantId]);
}
