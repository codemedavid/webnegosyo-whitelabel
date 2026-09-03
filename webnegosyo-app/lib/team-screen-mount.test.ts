// Guardrails for the Team screen. Jest only runs pure-logic roots here, so
// like the other mount guardrails this asserts on the component source: the
// screen must exist as a routable utility screen (a registered tab with no
// route file breaks the tab bar for every account), gate itself on
// canOpenTeam, and reach the backend only through lib/staff-service — never
// with its own hand-rolled fetch of app_users.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "team.tsx");

describe("Team screen mounting", () => {
  it("is registered in the (main) layout as a utility screen, never a tab", () => {
    const layout = read("app", "(main)", "_layout.tsx");
    const registration = layout.match(/name="team"[\s\S]{0,120}/)?.[0] ?? "";
    expect(registration).toMatch(/href:\s*null/);
  });

  it("is reachable from the Account screen, gated on canOpenTeam", () => {
    const account = read("app", "(main)", "account.tsx");
    expect(account).toMatch(/canOpenTeam/);
    expect(account).toMatch(/\/\(main\)\/team/);
  });
});

describe("Team screen gates", () => {
  it("refuses a session canOpenTeam rejects", () => {
    expect(screen()).toMatch(/canOpenTeam/);
  });

  it("talks to the backend only through the staff-service client", () => {
    const src = screen();
    expect(src).toMatch(/from "\.\.\/\.\.\/lib\/staff-service"/);
    expect(src).toMatch(/manage-staff/);
    // The service-role boundary lives in the edge function; the screen must
    // never query or write the access table itself.
    expect(src).not.toMatch(/from\(["']app_users["']\)/);
  });

  it("offers the shared permission and screen registries, not private lists", () => {
    const src = screen();
    expect(src).toMatch(/PERMISSION_OPTIONS/);
    expect(src).toMatch(/PINNABLE_SCREENS/);
  });
});
