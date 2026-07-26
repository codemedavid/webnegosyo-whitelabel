// Guardrail: the platform console must mount without racing the auth store.
//
// The crash this locks down is real and specific. The auth store starts as
// `{ isLoading: true, isSuperadmin: false }`, so a role gate that redirects on
// `!isSuperadmin` alone fires during cold start — before auth has resolved.
// The root redirect then sends the session back to (superadmin), remounting the
// Tabs navigator while its nested params are already marked consumed.
// react-navigation then calls TabRouter.getRehydratedState(undefined) and
// throws "Cannot read property 'stale' of undefined" from <Tabs>.
//
// Jest only runs pure-logic roots (lib/, theme/), so this asserts on the screen
// sources rather than rendering them — same approach as the other mount
// guardrails in this directory.
import { readFileSync } from "fs";
import { join } from "path";

const APP_DIR = join(__dirname, "..", "app");

function readSource(...segments: string[]): string {
  return readFileSync(join(APP_DIR, ...segments), "utf8");
}

describe("superadmin layout role gate", () => {
  const source = readSource("(superadmin)", "_layout.tsx");

  it("reads the auth store's loading flag", () => {
    expect(source).toMatch(/isLoading/);
  });

  it("waits for auth to resolve before redirecting away", () => {
    // The redirect must be suppressed while isLoading is true; redirecting on
    // the initial `isSuperadmin: false` is what remounts the navigator.
    expect(source).toMatch(/if \(isLoading\)\s*return;/);
  });

  it("keeps isLoading in the effect dependency list", () => {
    // Without it the gate never re-evaluates once auth resolves.
    const deps = source.match(/\}, \[([^\]]*)\]\);/);
    expect(deps?.[1]).toMatch(/isLoading/);
  });
});

describe("post-login navigation ownership", () => {
  const loginSource = readSource("(auth)", "login.tsx");
  const rootSource = readSource("_layout.tsx");

  it("leaves the post-login redirect to the root auth redirect", () => {
    // Two navigations to the same nested href race: the login screen replaces,
    // then useAuthRedirect re-fires against stale segments and replaces again,
    // remounting the target navigator mid-mount. The root hook owns routing.
    expect(loginSource).not.toMatch(/router\.replace\(session\.landingHref/);
  });

  it("still resolves the session so the store drives the redirect", () => {
    expect(loginSource).toMatch(/resolveSession/);
  });

  it("keeps the root redirect guarding against a redundant replace", () => {
    expect(rootSource).toMatch(/if \(group !== wantedGroup\)/);
  });
});
