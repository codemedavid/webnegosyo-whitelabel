/**
 * The report range picker's selection, as the inclusive Manila days the
 * deletion routes take. Reusing the picker keeps one calendar in the app.
 */
import { selectionToDeletionRange } from "./range";

// 2026-09-24 10:00 Manila.
const NOW = Date.parse("2026-09-24T02:00:00.000Z");

describe("selectionToDeletionRange", () => {
  test("a single day is a one-day range", () => {
    expect(selectionToDeletionRange({ kind: "day", dayKey: "2026-09-10" }, NOW)).toEqual({
      from: "2026-09-10",
      to: "2026-09-10",
    });
  });

  test("a picked range keeps both ends", () => {
    expect(selectionToDeletionRange({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-15" }, NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-15",
    });
  });

  test("a preset ends today, in Manila", () => {
    expect(selectionToDeletionRange({ kind: "preset", days: 7 }, NOW)).toEqual({
      from: "2026-09-18",
      to: "2026-09-24",
    });
  });
});
