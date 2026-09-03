// Typed client for the manage-staff edge function — the Team screen's whole
// data layer. The phone never holds the service-role key, so every staff
// operation goes to supabase/functions/manage-staff, which re-derives the
// caller's tenant and authority from their JWT. This module only shapes
// requests, maps rows, and unwraps errors; the transport is injected so it
// stays unit-testable (same arrangement as the other store-injected modules
// here). Wire it with:
//
//   const invoke: ManageStaffInvoke = (body) =>
//     supabase.functions.invoke("manage-staff", { method: "POST", body });

/**
 * The store to act on, sent only by a superadmin viewing a store — every other
 * caller's store comes from their own access row and this field is ignored.
 */
export interface TenantScoped {
  tenantId?: string | null;
}

export type ManageStaffRequest = TenantScoped &
  (
    | { action: "list" }
    | { action: "create"; input: CreateStaffInput }
    | { action: "update_permissions"; userId: string; permissions: string[] }
    | { action: "update_branch"; userId: string; outletId: string | null }
    | { action: "update_default_screen"; userId: string; defaultTab: string | null }
    | { action: "reset_password"; userId: string; newPassword: string }
    | { action: "remove"; userId: string }
  );

export type ManageStaffInvoke = (
  body: ManageStaffRequest
) => Promise<{ data: unknown; error: unknown }>;

/**
 * Scope a transport to the store currently being viewed.
 *
 * The function derives the store from the caller's own access row, which is
 * right for an owner or a branch admin. A superadmin viewing a store ("open as
 * merchant") has no store of its own, so the viewed one has to travel with the
 * request; pass null off impersonation and the request goes out untouched.
 */
export function withTenantScope(
  invoke: ManageStaffInvoke,
  tenantId: string | null
): ManageStaffInvoke {
  if (!tenantId) return invoke;
  return (body) => invoke({ ...body, tenantId });
}

export interface CreateStaffInput {
  email: string;
  password: string;
  displayName: string;
  permissions: string[];
  /** Branch to confine the account to; null = the whole store. */
  outletId?: string | null;
  /** Screen the app opens this account on; null = the app decides. */
  defaultTab?: string | null;
}

export interface StaffMember {
  userId: string;
  isOwner: boolean;
  /** null = the whole store. */
  outletId: string | null;
  /** null = full access (owner/legacy accounts). */
  permissions: string[] | null;
  displayName: string | null;
  email: string | null;
  defaultTab: string | null;
  createdAt: string;
}

/** The session fields that decide whether the Team entry is shown at all. */
export interface TeamViewer {
  role: string | null;
  isOwner: boolean;
  permissions: string[] | null;
  outletId: string | null;
  isDemo: boolean;
}

/**
 * Whether this session may open the Team screen: the owner (or a superadmin),
 * or a branch admin — a branch-locked account holding `branch_staff`. Mirrors
 * the edge function's own front door, so the entry never leads to a 403.
 * Demo sessions have no real backend to manage.
 */
export function canOpenTeam(viewer: TeamViewer): boolean {
  if (viewer.isDemo) return false;
  if (viewer.role === "superadmin" || viewer.isOwner) return true;
  if (viewer.role !== "admin") return false;
  if (!viewer.outletId) return false;
  if (viewer.permissions == null) return false;
  return viewer.permissions.includes("branch_staff");
}

interface RawStaffRow {
  user_id: string;
  is_owner: boolean;
  outlet_id?: string | null;
  permissions: string[] | null;
  display_name: string | null;
  email: string | null;
  default_tab?: string | null;
  created_at: string;
}

function toStaffMember(row: RawStaffRow): StaffMember {
  return {
    userId: row.user_id,
    isOwner: row.is_owner,
    outletId: row.outlet_id ?? null,
    permissions: row.permissions,
    displayName: row.display_name,
    email: row.email,
    defaultTab: row.default_tab ?? null,
    createdAt: row.created_at,
  };
}

/** The server's own message from a FunctionsHttpError, when it carried one. */
async function extractInvokeError(error: unknown): Promise<string> {
  const fallback =
    error instanceof Error ? error.message : "The staff request failed";
  const context = (error as { context?: { json?: () => Promise<unknown> } })
    ?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: string } | null;
      if (body?.error) return body.error;
    } catch {
      // Response body was not JSON — keep the generic message.
    }
  }
  return fallback;
}

async function callManageStaff(
  invoke: ManageStaffInvoke,
  body: ManageStaffRequest
): Promise<unknown> {
  const { data, error } = await invoke(body);
  if (error) {
    throw new Error(await extractInvokeError(error));
  }
  const envelope = data as { success?: boolean; data?: unknown; error?: string } | null;
  if (!envelope || envelope.success !== true) {
    throw new Error(envelope?.error ?? "The staff request failed");
  }
  return envelope.data;
}

/** Every staff account the caller may see (and therefore act on). */
export async function listStaff(invoke: ManageStaffInvoke): Promise<StaffMember[]> {
  const data = await callManageStaff(invoke, { action: "list" });
  if (!Array.isArray(data)) return [];
  return (data as RawStaffRow[]).map(toStaffMember);
}

export async function createStaff(
  invoke: ManageStaffInvoke,
  input: CreateStaffInput
): Promise<StaffMember> {
  const data = await callManageStaff(invoke, { action: "create", input });
  return toStaffMember(data as RawStaffRow);
}

export async function updateStaffPermissions(
  invoke: ManageStaffInvoke,
  userId: string,
  permissions: string[]
): Promise<void> {
  await callManageStaff(invoke, { action: "update_permissions", userId, permissions });
}

export async function updateStaffBranch(
  invoke: ManageStaffInvoke,
  userId: string,
  outletId: string | null
): Promise<void> {
  await callManageStaff(invoke, { action: "update_branch", userId, outletId });
}

export async function updateStaffDefaultScreen(
  invoke: ManageStaffInvoke,
  userId: string,
  defaultTab: string | null
): Promise<void> {
  await callManageStaff(invoke, { action: "update_default_screen", userId, defaultTab });
}

export async function resetStaffPassword(
  invoke: ManageStaffInvoke,
  userId: string,
  newPassword: string
): Promise<void> {
  await callManageStaff(invoke, { action: "reset_password", userId, newPassword });
}

export async function removeStaff(
  invoke: ManageStaffInvoke,
  userId: string
): Promise<void> {
  await callManageStaff(invoke, { action: "remove", userId });
}
