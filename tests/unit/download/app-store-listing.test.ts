import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  formatReleaseDate,
  parseAppStoreLookup,
  splitReleaseNotes,
} from "@/lib/download/app-store-listing";
import { APP_SCREENS } from "@/lib/download/app-screens";

/** The shape iTunes `lookup` answered with for the live listing (trimmed). */
const LIVE_LOOKUP = {
  resultCount: 1,
  results: [
    {
      trackName: "SmartMenu PH",
      version: "1.0.14",
      averageUserRating: 5,
      userRatingCount: 2,
      releaseNotes:
        "• A new welcome screen before you log in.\n• Split one payment across up to 4 methods.\n\n• Smoother headers and many fixes.",
      currentVersionReleaseDate: "2026-10-15T22:19:08Z",
      minimumOsVersion: "15.1",
    },
  ],
};

describe("parseAppStoreLookup", () => {
  test("reads rating, version, notes and release date from a live answer", () => {
    // Act
    const listing = parseAppStoreLookup(LIVE_LOOKUP);

    // Assert
    expect(listing).toEqual({
      rating: 5,
      ratingCount: 2,
      version: "1.0.14",
      releaseNotes: [
        "A new welcome screen before you log in.",
        "Split one payment across up to 4 methods.",
        "Smoother headers and many fixes.",
      ],
      releasedAt: "2026-10-15T22:19:08Z",
      minimumOsVersion: "15.1",
    });
  });

  test("returns null when the app is not found", () => {
    expect(parseAppStoreLookup({ resultCount: 0, results: [] })).toBeNull();
  });

  test("returns null for an answer that is not a lookup at all", () => {
    expect(parseAppStoreLookup("<html>rate limited</html>")).toBeNull();
    expect(parseAppStoreLookup(null)).toBeNull();
    expect(parseAppStoreLookup({ results: [{ version: "" }] })).toBeNull();
  });

  test("an unrated app shows no rating instead of a zero", () => {
    // Arrange
    const unrated = {
      resultCount: 1,
      results: [{ version: "1.0.0", averageUserRating: 0, userRatingCount: 0 }],
    };

    // Act
    const listing = parseAppStoreLookup(unrated);

    // Assert
    expect(listing?.rating).toBeNull();
    expect(listing?.ratingCount).toBe(0);
    expect(listing?.releaseNotes).toEqual([]);
    expect(listing?.releasedAt).toBeNull();
  });

  test("an out-of-range rating is dropped, not shown", () => {
    const odd = {
      resultCount: 1,
      results: [{ version: "1.0.0", averageUserRating: 7, userRatingCount: 3 }],
    };

    expect(parseAppStoreLookup(odd)?.rating).toBeNull();
  });
});

describe("splitReleaseNotes", () => {
  test("strips bullet markers and blank lines", () => {
    expect(splitReleaseNotes("• One\n- Two\n* Three\n\n   \nFour")).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
    ]);
  });
});

describe("formatReleaseDate", () => {
  test("formats the date in Manila time", () => {
    // 22:19 UTC on the 15th is already the 16th in Manila.
    expect(formatReleaseDate("2026-10-15T22:19:08Z")).toBe("Oct 16, 2026");
  });

  test("returns null for a date it cannot read", () => {
    expect(formatReleaseDate("not a date")).toBeNull();
  });
});

describe("APP_SCREENS", () => {
  test("every screenshot ships in public/ and is described", () => {
    expect(APP_SCREENS.length).toBeGreaterThan(0);
    for (const screen of APP_SCREENS) {
      expect(existsSync(join(process.cwd(), "public", screen.src))).toBe(true);
      expect(screen.alt.length).toBeGreaterThan(20);
    }
  });

  test("no screenshot is listed twice", () => {
    const sources = APP_SCREENS.map((screen) => screen.src);

    expect(new Set(sources).size).toBe(sources.length);
  });
});
