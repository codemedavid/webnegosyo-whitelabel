/**
 * Guardrail: the two owner surfaces must never disagree about a branch.
 *
 * Written as a regression pin rather than a RED-first driver — the parity was
 * built deliberately, and this exists so it survives the next edit.
 *
 * Branches and Portfolio both show an owner "how is this branch doing". The
 * moment one of them computes its own figures, the same branch reads ₱201k on
 * one screen and ₱198k on the other, and an owner who spots that stops trusting
 * both. Jest only runs pure-logic roots here, so this asserts on the screen
 * sources the same way `business-screen-mount.test.ts` does.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SCREENS_DIR = join(__dirname, "..", "app", "(main)");

const OWNER_SCREENS = ["branches", "portfolio"] as const;

function source(screen: string): string {
  return readFileSync(join(SCREENS_DIR, `${screen}.tsx`), "utf8");
}

describe("owner surfaces", () => {
  it.each(OWNER_SCREENS)("derives %s figures from the shared KPI math", (screen) => {
    const text = source(screen);

    expect(text).toMatch(/from "\.\.\/\.\.\/lib\/branch-kpis"/);
    expect(text).toMatch(/buildBranchKpis/);
    expect(text).toMatch(/storeKpiTotals/);
    expect(text).toMatch(/assignBranchVerdicts/);
  });

  it.each(OWNER_SCREENS)("renders the shared branch card in %s", (screen) => {
    expect(source(screen)).toMatch(
      /import \{ BranchPerformanceCard \} from "\.\.\/\.\.\/components\/BranchPerformanceCard";/,
    );
  });

  it.each(OWNER_SCREENS)("takes its window from buildKpiPeriod in %s", (screen) => {
    // A hand-rolled `Date.now() - 7 * DAY` window would split today across a
    // bucket boundary and make every sparkline's last bar short.
    expect(source(screen)).toMatch(/buildKpiPeriod\(/);
  });

  it.each(OWNER_SCREENS)("keeps the un-narrowed account scope in %s", (screen) => {
    // Both are views of the whole company: narrowing them to the branch being
    // viewed collapses the comparison and leaves no way back.
    expect(source(screen)).toMatch(/useAccountBranchScope/);
  });

  it.each(OWNER_SCREENS)("never opens the unassigned bucket as a branch in %s", (screen) => {
    // There is nothing to run, and a scope built from it would match orders no
    // branch owns.
    const text = source(screen);
    const opensUnassigned = /onPress=\{\(\) => openBranch\(row\.outletId as string/.test(text);
    const guardsUnassigned = /outletId !== null/.test(text);

    expect(!opensUnassigned || guardsUnassigned).toBe(true);
  });
});
