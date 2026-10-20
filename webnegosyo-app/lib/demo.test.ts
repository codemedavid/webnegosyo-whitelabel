import { DEMO_STORE, demoSessionAuth } from "./demo";

describe("demoSessionAuth", () => {
  it("opens the demo store as a read-only guest with no user", () => {
    const auth = demoSessionAuth();
    expect(auth.userId).toBeNull();
    expect(auth.tenantId).toBe(DEMO_STORE.tenantId);
    expect(auth.isDemo).toBe(true);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.isLoading).toBe(false);
  });
});
