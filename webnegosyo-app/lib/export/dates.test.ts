import { exportFileName, formatExportDateTime, formatExportDay } from "./dates";

// 2026-08-18T02:05:00Z === 2026-08-18 10:05 Manila (UTC+8)
const AUG_18_MORNING = Date.UTC(2026, 7, 18, 2, 5, 0);
// 2026-08-17T17:00:00Z === 2026-08-18 01:00 Manila — the day differs from UTC's
const AUG_18_PAST_MIDNIGHT = Date.UTC(2026, 7, 17, 17, 0, 0);

const DAY_MS = 24 * 60 * 60 * 1000;

describe("formatExportDay", () => {
  it("renders the Manila calendar day, not the UTC one", () => {
    expect(formatExportDay(AUG_18_PAST_MIDNIGHT)).toBe("2026-08-18");
  });

  it("renders a plain morning timestamp as its day", () => {
    expect(formatExportDay(AUG_18_MORNING)).toBe("2026-08-18");
  });
});

describe("formatExportDateTime", () => {
  it("renders date and minute in Manila time", () => {
    expect(formatExportDateTime(AUG_18_MORNING)).toBe("2026-08-18 10:05");
  });

  it("zero-pads hours and minutes", () => {
    expect(formatExportDateTime(AUG_18_PAST_MIDNIGHT)).toBe("2026-08-18 01:00");
  });
});

describe("exportFileName", () => {
  it("names the file after the prefix and the inclusive day range", () => {
    // Half-open window: [Aug 12 00:00, Aug 19 00:00) Manila covers Aug 12–18.
    const startMs = Date.UTC(2026, 7, 11, 16, 0, 0); // Aug 12 00:00 Manila
    const endMs = Date.UTC(2026, 7, 18, 16, 0, 0); // Aug 19 00:00 Manila
    expect(exportFileName("orders", { startMs, endMs })).toBe(
      "orders_2026-08-12_2026-08-18.csv"
    );
  });

  it("collapses a single-day window to one date", () => {
    const startMs = Date.UTC(2026, 7, 17, 16, 0, 0); // Aug 18 00:00 Manila
    expect(exportFileName("sales", { startMs, endMs: startMs + DAY_MS })).toBe(
      "sales_2026-08-18.csv"
    );
  });
});
