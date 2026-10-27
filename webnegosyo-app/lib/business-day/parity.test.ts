/**
 * The app's copy of the business-day engine must say exactly what the web's
 * says. A Drawer that thinks Friday ends at midnight while the day close thinks
 * it ends at 4 AM would hand the owner two different Fridays.
 *
 * The app cannot import from the web's `src/`, so the modules are COPIED and
 * this test compares them line by line, ignoring only import lines (the paths
 * legitimately differ). The property tests run on the web copy
 * (`tests/unit/business-day/`); this file proves the app copy is that code.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { MIDNIGHT_SCHEDULE, describeCutoff, tradingDayOf, tradingDayWindow } from "./trading-day";
import { servicePeriodOf } from "./service-periods";
import { toBusinessDayKey } from "../daily-report/business-day";

/** webnegosyo-app/lib/business-day → repo root. */
const REPO_ROOT = join(__dirname, "..", "..", "..");
const WEB_DIR = join(REPO_ROOT, "src", "lib", "business-day");

function logicOf(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*import\s/.test(line))
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

const PORTED_MODULES = ["trading-day", "service-periods"];

describe("ported business-day modules match the web originals", () => {
  test.each(PORTED_MODULES)("%s.ts has not drifted from src/lib/business-day", (moduleName) => {
    const web = readFileSync(join(WEB_DIR, `${moduleName}.ts`), "utf8");
    const app = readFileSync(join(__dirname, `${moduleName}.ts`), "utf8");

    expect(logicOf(app)).toBe(logicOf(web));
  });
});

describe("the ported engine actually runs", () => {
  const fourAm = [{ effectiveFrom: "2026-01-01", cutoffMinutes: 240 }];

  test("an empty schedule is the Manila calendar day the app already uses", () => {
    const iso = "2026-10-24T17:30:00.000Z"; // Sat 1:30 AM Manila
    expect(tradingDayOf(iso, MIDNIGHT_SCHEDULE)).toBe(toBusinessDayKey(iso));
  });

  test("a 4 AM cutoff keeps a 1:30 AM sale on Friday", () => {
    expect(tradingDayOf("2026-10-24T17:30:00.000Z", fourAm)).toBe("2026-10-24");
    expect(tradingDayWindow("2026-10-24", fourAm).startIso).toBe("2026-10-23T20:00:00.000Z");
  });

  test("describes the cutoff in the setting's words", () => {
    expect(describeCutoff(240).example).toBe("Sales from Fri 4:00 AM until Sat 3:59 AM count as Friday.");
  });

  test("finds the night shift after midnight", () => {
    const night = { startsMinutes: 20 * 60, endsMinutes: 2 * 60 };
    expect(servicePeriodOf("2026-10-24T17:00:00.000Z", [night], fourAm)?.dayKey).toBe("2026-10-24");
  });
});
