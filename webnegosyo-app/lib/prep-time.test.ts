import {
  PREP_MINUTE_PRESETS,
  PREP_TIME_SCHEMA_VERSION,
  MAX_PREP_MINUTES,
  isPrepTimeSupported,
  normalizePrepMinutes,
  promisedReadyAt,
  prepPromiseState,
  formatClock,
  prepTimeTargetStatus,
} from "./prep-time";

const MINUTE = 60_000;

describe("prep time presets", () => {
  it("offers the four quick taps a cook actually reaches for", () => {
    expect(PREP_MINUTE_PRESETS).toEqual([10, 15, 20, 30]);
  });
});

describe("normalizePrepMinutes", () => {
  it("accepts a whole number of minutes inside the allowed range", () => {
    expect(normalizePrepMinutes(15)).toBe(15);
    expect(normalizePrepMinutes("20")).toBe(20);
  });

  it("rejects zero, negatives and anything past the ceiling", () => {
    expect(normalizePrepMinutes(0)).toBeNull();
    expect(normalizePrepMinutes(-5)).toBeNull();
    expect(normalizePrepMinutes(MAX_PREP_MINUTES + 1)).toBeNull();
  });

  it("rejects junk rather than sending NaN to the backend", () => {
    expect(normalizePrepMinutes("soon")).toBeNull();
    expect(normalizePrepMinutes(null)).toBeNull();
    expect(normalizePrepMinutes(undefined)).toBeNull();
    expect(normalizePrepMinutes(12.5)).toBeNull();
  });
});

describe("promisedReadyAt", () => {
  it("stamps an absolute instant from the moment of the tap, not the order", () => {
    // Arrange — the chef taps 15 minutes at 7:06.
    const tapMs = Date.UTC(2026, 7, 29, 11, 6, 0);

    // Act
    const promised = promisedReadyAt(tapMs, 15);

    // Assert — 7:21, regardless of when the order was placed.
    expect(promised).toBe(tapMs + 15 * MINUTE);
  });
});

describe("prepPromiseState", () => {
  const nowMs = Date.UTC(2026, 7, 29, 11, 10, 0);

  it("reports no promise when the kitchen has not committed to a time", () => {
    expect(prepPromiseState(null, nowMs)).toEqual({ kind: "none" });
    expect(prepPromiseState(undefined, nowMs)).toEqual({ kind: "none" });
  });

  it("counts down the minutes remaining while still on time", () => {
    expect(prepPromiseState(nowMs + 8 * MINUTE, nowMs)).toEqual({
      kind: "due",
      minutesRemaining: 8,
    });
  });

  it("rounds up so a promise 30 seconds out never reads as zero minutes", () => {
    expect(prepPromiseState(nowMs + 30_000, nowMs)).toEqual({
      kind: "due",
      minutesRemaining: 1,
    });
  });

  it("flips to late once the promised instant has passed", () => {
    expect(prepPromiseState(nowMs - 4 * MINUTE, nowMs)).toEqual({
      kind: "late",
      minutesLate: 4,
    });
  });
});

describe("formatClock", () => {
  it("renders the promised instant as a wall clock in the store's timezone", () => {
    // 11:21 UTC is 7:21 PM in Manila (UTC+8, no DST).
    const promised = Date.UTC(2026, 7, 29, 11, 21, 0);
    expect(formatClock(promised, "Asia/Manila")).toBe("7:21 PM");
  });
});

describe("prepTimeTargetStatus", () => {
  it("starts the cook: committing to a time moves a confirmed ticket to preparing", () => {
    expect(prepTimeTargetStatus("confirmed")).toBe("preparing");
  });

  it("leaves an already-cooking ticket alone when the time is revised", () => {
    expect(prepTimeTargetStatus("preparing")).toBe("preparing");
  });
});

describe("isPrepTimeSupported", () => {
  it("is supported on the platform backend, which needs only the migration", () => {
    expect(
      isPrepTimeSupported({ orderBackend: "platform", convexSchemaVersion: null }),
    ).toBe(true);
  });

  it("is supported on a Convex deployment carrying the prep-time bundle", () => {
    expect(
      isPrepTimeSupported({
        orderBackend: "convex",
        convexSchemaVersion: PREP_TIME_SCHEMA_VERSION,
      }),
    ).toBe(true);
  });

  it("is NOT offered on a Convex deployment still running an older bundle", () => {
    // The mutation does not exist there yet. Showing the chips would give the
    // cook a control that throws — worse than no control at all.
    expect(
      isPrepTimeSupported({
        orderBackend: "convex",
        convexSchemaVersion: PREP_TIME_SCHEMA_VERSION - 1,
      }),
    ).toBe(false);
  });

  it("treats an unrecorded Convex version as too old", () => {
    expect(
      isPrepTimeSupported({ orderBackend: "convex", convexSchemaVersion: null }),
    ).toBe(false);
  });

  it("is not offered on the per-tenant supabase track, which has no adapter", () => {
    expect(
      isPrepTimeSupported({ orderBackend: "supabase", convexSchemaVersion: 99 }),
    ).toBe(false);
  });
});
