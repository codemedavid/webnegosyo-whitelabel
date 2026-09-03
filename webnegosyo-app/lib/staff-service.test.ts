// The Team screen's data layer: a thin, typed client over the manage-staff
// edge function. The transport is injected (like every store-injected module
// here) so these tests prove the request bodies, the row mapping, and the
// error unwrapping without touching supabase-js.

import {
  canOpenTeam,
  createStaff,
  listStaff,
  removeStaff,
  resetStaffPassword,
  updateStaffBranch,
  updateStaffDefaultScreen,
  updateStaffPermissions,
  type ManageStaffInvoke,
  type StaffMember,
} from "./staff-service";

// ============================================
// canOpenTeam — who gets the Team entry at all
// ============================================

describe("canOpenTeam", () => {
  it("opens for the owner", () => {
    expect(
      canOpenTeam({ role: "admin", isOwner: true, permissions: null, outletId: null, isDemo: false })
    ).toBe(true);
  });

  it("opens for a branch admin holding branch_staff on its own branch", () => {
    expect(
      canOpenTeam({
        role: "admin",
        isOwner: false,
        permissions: ["orders", "branch_staff"],
        outletId: "outlet-a",
        isDemo: false,
      })
    ).toBe(true);
  });

  it("stays closed for plain staff, store-wide branch_staff, and demo", () => {
    // Plain staff: no branch_staff grant.
    expect(
      canOpenTeam({ role: "admin", isOwner: false, permissions: ["orders"], outletId: "outlet-a", isDemo: false })
    ).toBe(false);
    // branch_staff without a branch lock is refused (mirrors canManageBranchStaff).
    expect(
      canOpenTeam({ role: "admin", isOwner: false, permissions: ["branch_staff"], outletId: null, isDemo: false })
    ).toBe(false);
    // Demo sessions have no real backend to manage.
    expect(
      canOpenTeam({ role: "admin", isOwner: true, permissions: null, outletId: null, isDemo: true })
    ).toBe(false);
  });
});

// ============================================
// Transport fakes
// ============================================

const RAW_ROW = {
  user_id: "u1",
  tenant_id: "t1",
  role: "admin",
  is_owner: false,
  outlet_id: "outlet-a",
  permissions: ["orders"],
  display_name: "Ana",
  email: "ana@example.com",
  default_tab: "orders",
  created_at: "2026-01-01T00:00:00.000Z",
};

function okInvoke(data: unknown): { invoke: ManageStaffInvoke; calls: unknown[] } {
  const calls: unknown[] = [];
  const invoke: ManageStaffInvoke = async (body) => {
    calls.push(body);
    return { data: { success: true, data }, error: null };
  };
  return { invoke, calls };
}

// ============================================
// listStaff
// ============================================

describe("listStaff", () => {
  it("posts the list action and maps rows to StaffMember", async () => {
    const { invoke, calls } = okInvoke([RAW_ROW]);
    const staff = await listStaff(invoke);
    expect(calls).toEqual([{ action: "list" }]);
    expect(staff).toEqual<StaffMember[]>([
      {
        userId: "u1",
        isOwner: false,
        outletId: "outlet-a",
        permissions: ["orders"],
        displayName: "Ana",
        email: "ana@example.com",
        defaultTab: "orders",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("unwraps a server refusal into a thrown message", async () => {
    const invoke: ManageStaffInvoke = async () => ({
      data: { success: false, error: "Only the store owner or a branch admin can manage staff" },
      error: null,
    });
    await expect(listStaff(invoke)).rejects.toThrow(
      "Only the store owner or a branch admin can manage staff"
    );
  });

  it("pulls the server's message out of a FunctionsHttpError context", async () => {
    const invoke: ManageStaffInvoke = async () => ({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: { json: async () => ({ error: "This branch already has the maximum of 3 staff accounts" }) },
      }),
    });
    await expect(listStaff(invoke)).rejects.toThrow(
      "This branch already has the maximum of 3 staff accounts"
    );
  });
});

// ============================================
// Mutations — request bodies
// ============================================

describe("staff mutations", () => {
  it("createStaff sends the full input and returns the created member", async () => {
    const { invoke, calls } = okInvoke(RAW_ROW);
    const created = await createStaff(invoke, {
      email: "ana@example.com",
      password: "password123",
      displayName: "Ana",
      permissions: ["orders"],
      outletId: "outlet-a",
      defaultTab: "orders",
    });
    expect(calls).toEqual([
      {
        action: "create",
        input: {
          email: "ana@example.com",
          password: "password123",
          displayName: "Ana",
          permissions: ["orders"],
          outletId: "outlet-a",
          defaultTab: "orders",
        },
      },
    ]);
    expect(created.userId).toBe("u1");
  });

  it("shapes each update action the edge function expects", async () => {
    const { invoke, calls } = okInvoke(undefined);
    await updateStaffPermissions(invoke, "u1", ["orders", "pos"]);
    await updateStaffBranch(invoke, "u1", null);
    await updateStaffDefaultScreen(invoke, "u1", "pos");
    await resetStaffPassword(invoke, "u1", "newpassword1");
    await removeStaff(invoke, "u1");
    expect(calls).toEqual([
      { action: "update_permissions", userId: "u1", permissions: ["orders", "pos"] },
      { action: "update_branch", userId: "u1", outletId: null },
      { action: "update_default_screen", userId: "u1", defaultTab: "pos" },
      { action: "reset_password", userId: "u1", newPassword: "newpassword1" },
      { action: "remove", userId: "u1" },
    ]);
  });
});
