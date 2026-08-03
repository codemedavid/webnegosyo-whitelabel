/**
 * Turning a picker's Date into the strings the schedule already speaks.
 *
 * Everything downstream of the editor — `schedule.ts`, `validateCampaignDraft`,
 * the `sms_campaigns` columns — speaks `YYYY-MM-DD` and `HH:MM`. A date picker
 * hands back a `Date`. This module is the join, and it exists as its own file
 * because the one dangerous thing it does cannot be seen from a screen test:
 *
 * **The conversion must read LOCAL fields, never UTC.** Manila is UTC+8, so a
 * Date at local midnight on the 5th is 16:00 on the 4th in UTC. Reaching for
 * `toISOString().slice(0, 10)` — the obvious one-liner — silently books every
 * campaign a day early for anyone east of Greenwich. Same trap on the way in:
 * `new Date("2026-08-05")` parses as UTC midnight, which is the 4th locally.
 */

import {
  dateFieldToDate,
  dateToDateField,
  timeFieldToDate,
  dateToTimeField,
} from "./date-fields";

describe("dateToDateField — Date to YYYY-MM-DD", () => {
  it("reads the local calendar day, not the UTC one", () => {
    // 23:30 on the 5th, local. In Manila that is 15:30 UTC on the 5th — but at
    // any negative offset, or with a later local time, the naive UTC read slips
    // to a different day. This is the assertion that forbids toISOString().
    const picked = new Date(2026, 7, 5, 23, 30);

    expect(dateToDateField(picked)).toBe("2026-08-05");
  });

  it("pads single-digit months and days", () => {
    expect(dateToDateField(new Date(2026, 0, 9, 12, 0))).toBe("2026-01-09");
  });
});

describe("dateFieldToDate — YYYY-MM-DD to a Date the picker can show", () => {
  it("lands on the same calendar day it was given", () => {
    // A round trip is the honest test: whatever instant it picks inside the
    // day, reading it back must not move the day.
    const parsed = dateFieldToDate("2026-08-05", new Date(2026, 7, 1));

    expect(dateToDateField(parsed)).toBe("2026-08-05");
  });

  it("falls back when the field is empty, so the picker opens somewhere sane", () => {
    const fallback = new Date(2026, 7, 1, 9, 0);

    expect(dateToDateField(dateFieldToDate(null, fallback))).toBe("2026-08-01");
  });

  it("falls back on a value it cannot read, rather than showing an Invalid Date", () => {
    const fallback = new Date(2026, 7, 1, 9, 0);

    expect(dateToDateField(dateFieldToDate("tomorrow", fallback))).toBe("2026-08-01");
  });
});

describe("dateToTimeField — Date to HH:MM", () => {
  it("reads the local wall clock", () => {
    expect(dateToTimeField(new Date(2026, 7, 5, 9, 5))).toBe("09:05");
  });

  it("uses 24-hour time, because the schedule does", () => {
    expect(dateToTimeField(new Date(2026, 7, 5, 21, 0))).toBe("21:00");
  });

  it("pads midnight rather than writing 0:0", () => {
    expect(dateToTimeField(new Date(2026, 7, 5, 0, 0))).toBe("00:00");
  });
});

describe("timeFieldToDate — HH:MM to a Date the picker can show", () => {
  it("round-trips the wall clock", () => {
    expect(dateToTimeField(timeFieldToDate("21:30"))).toBe("21:30");
  });

  it("clamps a nonsense clock rather than rolling into the next day", () => {
    // `setHours(99, 99)` silently walks the date forward four days. A time
    // picker showing the wrong DAY for a quiet-hours field would be baffling.
    expect(dateToTimeField(timeFieldToDate("99:99"))).toBe("23:59");
  });

  it("survives a value the merchant half-typed", () => {
    // The field is still a string in the draft; a picker is not the only way
    // it can be set. Anything unreadable must not become an Invalid Date that
    // crashes the picker on open.
    expect(dateToTimeField(timeFieldToDate("2"))).toMatch(/^\d{2}:\d{2}$/);
    expect(dateToTimeField(timeFieldToDate(""))).toMatch(/^\d{2}:\d{2}$/);
    expect(dateToTimeField(timeFieldToDate(null))).toBe("00:00");
  });
});
