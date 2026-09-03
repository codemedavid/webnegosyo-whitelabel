// A superadmin viewing a store ("open as merchant") has no tenant of its own —
// its app_users row carries no tenant_id — so the manage-staff function cannot
// derive the store from the caller row the way it does for an owner. The
// viewed store therefore has to travel with the request, and only for that
// session: an owner's calls must stay exactly as they were.
import { readFileSync } from "fs";
import { join } from "path";

import { withTenantScope, type ManageStaffInvoke } from "./staff-service";

function recordingInvoke(): { invoke: ManageStaffInvoke; bodies: unknown[] } {
  const bodies: unknown[] = [];
  const invoke: ManageStaffInvoke = async (body) => {
    bodies.push(body);
    return { data: { success: true, data: [] }, error: null };
  };
  return { invoke, bodies };
}

describe("withTenantScope", () => {
  it("attaches the viewed store to every request", async () => {
    // Arrange
    const { invoke, bodies } = recordingInvoke();
    const scoped = withTenantScope(invoke, "tenant-a");

    // Act
    await scoped({ action: "list" });

    // Assert
    expect(bodies).toEqual([{ action: "list", tenantId: "tenant-a" }]);
  });

  it("leaves the request untouched when no store is being viewed", async () => {
    // Arrange
    const { invoke, bodies } = recordingInvoke();
    const scoped = withTenantScope(invoke, null);

    // Act
    await scoped({ action: "remove", userId: "u1" });

    // Assert
    expect(bodies).toEqual([{ action: "remove", userId: "u1" }]);
  });

  it("returns the transport's own result unchanged", async () => {
    // Arrange
    const scoped = withTenantScope(
      async () => ({ data: { success: true, data: "payload" }, error: null }),
      "tenant-a"
    );

    // Act
    const result = await scoped({ action: "list" });

    // Assert
    expect(result).toEqual({ data: { success: true, data: "payload" }, error: null });
  });
});

describe("Team screen wiring", () => {
  const source = readFileSync(join(__dirname, "../app/(main)/team.tsx"), "utf8");

  it("scopes its transport to the impersonated store", () => {
    expect(source).toMatch(/withTenantScope\(/);
    expect(source).toMatch(/impersonatedTenantId/);
  });
});
