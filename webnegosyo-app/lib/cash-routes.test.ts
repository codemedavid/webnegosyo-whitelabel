// Cash screens are utility screens: registered once in the layout with
// href: null (never a tab, so no bar or hub changes for anyone), each with a
// gate in the permission registry and a door that asks it first. Sources are
// read, like the other mount guardrails, because this suite cannot render the
// tab navigator.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  CASH_RULES_ROUTE,
  CASH_SCREENS,
  CASH_SCREEN_DOORS,
  dayCloseHref,
  endShiftHref,
  pastShiftTarget,
  periodSalesHref,
  remittanceHref,
  shiftSalesHref,
} from "./cash-routes";
import { isTabAllowed } from "./staff-permissions";
import { WORKSPACES } from "./workspaces";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");
const layout = () => read("app", "(main)", "_layout.tsx");

describe("cash screen registration", () => {
  it.each(CASH_SCREENS)("registers %s as a utility screen, never a tab", (screen) => {
    const registration = layout().match(new RegExp(`name="${screen}"[\\s\\S]{0,120}`))?.[0] ?? "";
    expect(registration).toMatch(/href:\s*null/);
    expect(WORKSPACES.flatMap((w) => w.tabs)).not.toContain(screen);
  });

  it("names a door for every screen, and the door is a screen that exists", () => {
    for (const screen of CASH_SCREENS) {
      expect(CASH_SCREEN_DOORS[screen].length).toBeGreaterThan(0);
      for (const door of CASH_SCREEN_DOORS[screen]) {
        const isCash = (CASH_SCREENS as readonly string[]).includes(door);
        expect(isCash || existsSync(join(ROOT, "app", "(main)", `${door}.tsx`))).toBe(true);
      }
    }
  });

  it("keeps the manager screens from a cashier (an unmapped screen would be open to all)", () => {
    const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
    for (const screen of ["remittances", "day-close", "cash-rules", "cash-drawers"]) {
      expect(isTabAllowed(cashier, screen)).toBe(false);
    }
    // A cashier's own shift report is decided by report_shift_sales on the server.
    expect(isTabAllowed(cashier, "shift-sales")).toBe(true);
  });
});

describe("cash hrefs", () => {
  it("substitute every param", () => {
    expect(shiftSalesHref("s 1")).toBe("/(main)/shift-sales?shift=s%201");
    expect(endShiftHref("s1")).toBe("/(main)/end-shift?shift=s1");
    expect(remittanceHref("r1")).toBe("/(main)/remittance?id=r1");
    expect(dayCloseHref("2026-10-24")).toBe("/(main)/day-close?day=2026-10-24");
    expect(dayCloseHref("2026-10-24", "b1")).toBe("/(main)/day-close?day=2026-10-24&outlet=b1");
    expect(CASH_RULES_ROUTE).toBe("/(main)/cash-rules");
  });

  it("send a past window as from/to and the named shift as period", () => {
    expect(periodSalesHref({ fromIso: "2026-10-24T04:00:00.000Z", toIso: "2026-10-25T04:00:00.000Z" })).toBe(
      "/(main)/shift-sales?from=2026-10-24T04%3A00%3A00.000Z&to=2026-10-25T04%3A00%3A00.000Z",
    );
    expect(periodSalesHref({ fromIso: "a", toIso: "b", periodId: "p1" })).toBe("/(main)/shift-sales?from=a&to=b&period=p1");
  });
});

describe("pastShiftTarget", () => {
  const schedule = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];

  it("is the whole business day without a named shift", () => {
    // Fri Oct 24, day ends 4 AM: Fri 4:00 AM Manila → Sat 4:00 AM Manila.
    expect(pastShiftTarget("2026-10-24", null, schedule)).toEqual({
      fromIso: "2026-10-23T20:00:00.000Z",
      toIso: "2026-10-24T20:00:00.000Z",
      periodId: null,
    });
  });

  it("runs a night shift into the next calendar day", () => {
    const night = { id: "p2", startsMinutes: 20 * 60, endsMinutes: 2 * 60 };
    expect(pastShiftTarget("2026-10-24", night, schedule)).toEqual({
      fromIso: "2026-10-24T12:00:00.000Z",
      toIso: "2026-10-24T18:00:00.000Z",
      periodId: "p2",
    });
  });
});

describe("cash doors", () => {
  it("Cash drawers opens the rules for whoever may open them", () => {
    const drawers = read("app", "(main)", "cash-drawers.tsx");
    expect(drawers).toMatch(/cashRulesAccess\(/);
    expect(drawers).toMatch(/CASH_RULES_ROUTE/);
  });

  it("Manage offers the rules to a Settings holder who has no Cash drawers row", () => {
    const manage = read("app", "(main)", "menu.tsx");
    expect(manage).toMatch(/cashRulesAccess\(/);
    expect(manage).toMatch(/CASH_RULES_ROUTE/);
  });

  it("Reports offers past shifts to a sales-report holder", () => {
    const reports = read("app", "(main)", "reports.tsx");
    expect(reports).toMatch(/<PastShiftsSheet/);
    expect(reports).toMatch(/hasPermission\([^)]*"reports"\)/);
  });

  it("Reports and Home open Remittances for a cash manager", () => {
    const reports = read("app", "(main)", "reports.tsx");
    expect(reports).toMatch(/isTabAllowed\(ctx\.caller, "remittances"\)/);
    expect(reports).toMatch(/REMITTANCES_ROUTE/);
    const home = read("app", "(main)", "dashboard.tsx");
    expect(home).toMatch(/<RemitInboxStrip/);
    expect(read("components", "remittances", "RemitInboxStrip.tsx")).toMatch(/canManageCash\(/);
  });

  it("the inbox gates itself and writes only through lib/cash", () => {
    const screen = read("app", "(main)", "remittances.tsx");
    expect(screen).toMatch(/isTabAllowed\(caller, "remittances"\)/);
    expect(screen).not.toMatch(/\.from\(["']/);
    expect(screen).not.toMatch(/supabase|@tanstack/);
  });

  it("the day close gates itself, writes only through lib/cash, and has its doors", () => {
    const screen = read("app", "(main)", "day-close.tsx");
    expect(screen).toMatch(/isTabAllowed\([^)]*"day-close"\)/);
    expect(screen).not.toMatch(/\.from\(["']/);
    expect(screen).not.toMatch(/supabase|@tanstack/);
    expect(read("app", "(main)", "remittances.tsx")).toMatch(/dayCloseHref\(/);
    expect(read("components", "remittances", "RemitInboxStrip.tsx")).toMatch(/readyToClose\(/);
  });

  it("the rules screen gates itself and writes only through lib/cash", () => {
    const screen = read("app", "(main)", "cash-rules.tsx");
    expect(screen).toMatch(/cashRulesAccess\(/);
    expect(screen).toMatch(/<BackHeader[\s\S]{0,40}title="Shift & remit rules"/);
    expect(screen).not.toMatch(/\.from\(["']/);
    expect(screen).not.toMatch(/supabase/);
  });
});
