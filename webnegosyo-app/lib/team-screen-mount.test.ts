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

  it("is reachable from the Manage hub, gated on canOpenTeam", () => {
    // Team is setup, not account: it lives under Manage with the printer and
    // the store's products, and the gate is asked there.
    const manage = read("app", "(main)", "menu.tsx");
    expect(manage).toMatch(/canOpenTeam/);
    expect(manage).toMatch(/\/\(main\)\/team/);
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

  it("reaches the edge function through the bounded transport, never functions.invoke", () => {
    // `supabase.functions.invoke` awaits the session with no deadline and
    // collapses every failure into "Failed to send a request to the Edge
    // Function" — the alert merchants saw with no matching edge log, because
    // the request never left the phone. See lib/manage-staff-transport.ts.
    // Both staff screens share one client, so this is asserted where it lives.
    const client = read("lib", "manage-staff-client.ts");
    expect(client).toMatch(/createManageStaffInvoke/);
    expect(client).not.toMatch(/functions\.invoke/);
    expect(screen()).not.toMatch(/functions\.invoke/);
    expect(read("app", "(main)", "staff", "[userId].tsx")).not.toMatch(/functions\.invoke/);
  });

  it("offers the shared permission and screen registries, not private lists", () => {
    // The forms moved off the screen; the registries moved with them.
    const forms =
      read("components", "staff", "AddStaffSheet.tsx") +
      read("components", "staff", "StaffAccessPanel.tsx");
    expect(forms).toMatch(/PERMISSION_OPTIONS/);
    expect(forms).toMatch(/PINNABLE_SCREENS/);
  });

  it("opens one person's own screen rather than expanding a row in the list", () => {
    expect(screen()).toMatch(/\/\(main\)\/staff\//);
    const layout = read("app", "(main)", "_layout.tsx");
    const registration = layout.match(/name="staff\/\[userId\]"[\s\S]{0,120}/)?.[0] ?? "";
    expect(registration).toMatch(/href:\s*null/);
  });

  it("gates the person's own screen on the same rule as the roster", () => {
    const profile = read("app", "(main)", "staff", "[userId].tsx");
    expect(profile).toMatch(/canOpenTeam/);
    expect(profile).toMatch(/from "\.\.\/\.\.\/\.\.\/lib\/staff-service"/);
    expect(profile).not.toMatch(/from\(["']app_users["']\)/);
  });
});
