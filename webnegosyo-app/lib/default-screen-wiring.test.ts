import { readFileSync } from "fs";
import { join } from "path";

import { resolveSession, type AppUserRow, type TenantRow } from "./session-resolve";
import { useAuthStore } from "../stores/auth-store";

/**
 * The wiring between the column and the screen it opens.
 *
 * `default-landing.test.ts` proves the decision is right; this proves the
 * decision is ever asked for. That is a different failure and a worse one:
 * this repo has twice shipped a column that worked in every unit test and was
 * dead in the app, because it was never added to the `select()` that reads the
 * row. Both reads are asserted here, by source, because Jest's logic project
 * cannot mount a screen — and a projection is exactly the kind of wiring a
 * unit test of the pure module cannot see.
 */

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const APP_USER: AppUserRow = {
  tenant_id: "tenant-1",
  role: "admin",
  is_owner: false,
  permissions: ["pos"],
};

const TENANT: TenantRow = {
  id: "tenant-1",
  slug: "cafe",
  name: "Cafe",
  convex_deployment_url: null,
};

describe("the account row is read with the chosen screen on it", () => {
  it.each([
    ["cold start", ["app", "_layout.tsx"]],
    ["interactive sign-in", ["app", "(auth)", "login.tsx"]],
  ])("selects default_tab on %s", (_label, segments) => {
    const source = read(...(segments as string[]));
    const select = source.match(/\.from\("app_users"\)\s*\n?\s*\.select\("([^"]+)"\)/);

    expect(select?.[1]).toContain("default_tab");
  });
});

describe("resolveSession", () => {
  it("carries the chosen screen into the session", () => {
    const result = resolveSession(
      "user-1",
      { ...APP_USER, default_tab: "pos" },
      TENANT
    );

    expect(result.auth?.defaultTab).toBe("pos");
  });

  it("reports no choice as null rather than leaving it undefined", () => {
    // The store's typed slot is `string | null`; undefined would leak an
    // "unset" third state into every consumer.
    const result = resolveSession("user-1", APP_USER, TENANT);

    expect(result.auth?.defaultTab).toBeNull();
  });

  it("gives a superadmin no chosen screen", () => {
    const result = resolveSession(
      "user-1",
      { tenant_id: null, role: "superadmin", is_owner: false, permissions: null },
      null
    );

    expect(result.auth?.defaultTab).toBeNull();
  });
});

describe("auth store", () => {
  afterEach(() => {
    useAuthStore.getState().clear();
  });

  it("starts with no chosen screen", () => {
    expect(useAuthStore.getState().defaultTab).toBeNull();
  });

  it("forgets the chosen screen on sign-out", () => {
    // A screen pinned to one account must not follow the next person who signs
    // in on the same device.
    useAuthStore.getState().setAuth({ defaultTab: "pos" });
    useAuthStore.getState().clear();

    expect(useAuthStore.getState().defaultTab).toBeNull();
  });
});

describe("the landing hook asks for the decision", () => {
  it("resolves the landing through the shared rule rather than a second opinion", () => {
    const source = read("lib", "use-branch-landing.ts");

    expect(source).toContain("resolveLanding");
  });

  it("reads the chosen screen from the session", () => {
    const source = read("lib", "use-branch-landing.ts");

    expect(source).toMatch(/defaultTab/);
  });
});
