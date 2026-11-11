import {
  ACCESS_AUDIT_MAX_DAYS,
  auditDayKey,
  auditRetentionCutoff,
  bumpedAuditCounts,
  firstAuditDayOf,
} from "./accessAudit";

const NOV_6 = Date.UTC(2026, 10, 6, 12);

describe("accessAudit", () => {
  test("names a day by its UTC date", () => {
    expect(auditDayKey(NOV_6)).toBe("2026-11-06");
    expect(auditDayKey(Date.UTC(2026, 10, 6, 23, 59))).toBe("2026-11-06");
  });

  test("keeps thirty days of rows", () => {
    expect(auditRetentionCutoff(NOV_6)).toBe("2026-10-07");
  });

  test("counts a token-less write and a tokened write apart", () => {
    expect(bumpedAuditCounts(null, false)).toEqual({ tokenless: 1, withToken: 0 });
    expect(bumpedAuditCounts(null, true)).toEqual({ tokenless: 0, withToken: 1 });
    expect(bumpedAuditCounts({ tokenless: 4, withToken: 9 }, false)).toEqual({ tokenless: 5, withToken: 9 });
    expect(bumpedAuditCounts({ tokenless: 4, withToken: 9 }, true)).toEqual({ tokenless: 4, withToken: 10 });
  });

  test("a report window stays inside what is kept", () => {
    expect(firstAuditDayOf(NOV_6, 1)).toBe("2026-11-06");
    expect(firstAuditDayOf(NOV_6, 7)).toBe("2026-10-31");
    expect(firstAuditDayOf(NOV_6, 10_000)).toBe(firstAuditDayOf(NOV_6, ACCESS_AUDIT_MAX_DAYS));
    expect(firstAuditDayOf(NOV_6, 0)).toBe("2026-11-06");
    expect(firstAuditDayOf(NOV_6, Number.NaN)).toBe("2026-11-06");
    expect(firstAuditDayOf(NOV_6, 2.5)).toBe("2026-11-05");
  });
});
