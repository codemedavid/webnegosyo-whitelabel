/**
 * Guardrails for backend availability gates on platform-backend tenants.
 *
 * Four screens predate the platform Supabase order backend and still gated
 * their render on `convexUrl` alone, locking out tenants whose orders live in
 * the shared platform database — even though every ref those screens use is
 * served by the adapter in `lib/backends/`. Jest here only runs pure-logic
 * roots, so — like the other mount guardrails in this directory — this asserts
 * on the screen source rather than rendering it: the availability question must
 * go through `hasLiveOrderBackend`, never a bare `!convexUrl` check.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const GATED_SCREENS: Array<[string, string[]]> = [
  ["dashboard", ["app", "(main)", "dashboard.tsx"]],
  ["pos-sales", ["app", "(main)", "pos-sales.tsx"]],
  ["scan", ["app", "(main)", "scan.tsx"]],
  ["product-analytics", ["app", "(main)", "product-analytics.tsx"]],
];

describe.each(GATED_SCREENS)("%s screen backend gate", (_name, segments) => {
  const screen = read(...segments);

  it("asks hasLiveOrderBackend instead of deciding from convexUrl alone", () => {
    expect(screen).toMatch(/hasLiveOrderBackend/);
  });

  it("never gates the screen on a bare !convexUrl check", () => {
    // `!convexUrl` inside an if/ternary is the pre-platform pattern that shows
    // "Convex is not configured" to a healthy platform tenant.
    expect(screen).not.toMatch(/if \(!convexUrl\b/);
    expect(screen).not.toMatch(/\(!convexUrl \|\|/);
  });

  it("does not blame Convex in a user-facing message", () => {
    expect(screen).not.toMatch(/Convex is not configured/);
    expect(screen).not.toMatch(/requires Convex/);
  });
});

describe("interactive login tenant read", () => {
  const login = read("app", "(auth)", "login.tsx");

  it("selects convex_schema_version so a fresh login matches a cold start", () => {
    // app/_layout.tsx selects it; when login omits it the session lands with
    // convexSchemaVersion = null and branch-scoped daily-report revenue is
    // withheld until the next cold start.
    expect(login).toMatch(/convex_schema_version/);
  });
});

describe("useSafeAction backend routing", () => {
  const hooks = read("lib", "hooks.ts");
  const safeActionSource = hooks.slice(hooks.indexOf("export function useSafeAction"));

  it("resolves the per-ref route like the query/mutation hooks do", () => {
    expect(safeActionSource).toMatch(/resolveRefRoute/);
  });

  it("reports an unroutable action as a missing function, not a Convex outage", () => {
    // On a platform tenant the deployment url is legitimately absent; throwing
    // "Convex not connected" misdiagnoses a healthy store. The missing-function
    // marker is what screens already treat as "needs a backend update".
    expect(safeActionSource).toMatch(/MISSING_FN_MARKER/);
    expect(safeActionSource).not.toMatch(/Convex not connected/);
  });
});
