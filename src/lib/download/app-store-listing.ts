import { z } from "zod";

/**
 * The merchant app's live App Store listing, read for the `/download` page.
 *
 * Rating, version and "What's New" change with every release and every
 * review, so the page reads them from Apple's public lookup API instead of
 * hard-coding numbers that would quietly go stale. Anything unreadable comes
 * back as null and the page simply leaves that part out.
 */

export const APP_STORE_ID = "6761642956";

const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=ph`;
/** Ratings and release notes move slowly; a few hours of staleness is fine. */
const LISTING_REVALIDATE_SECONDS = 60 * 60 * 6;
const LOOKUP_TIMEOUT_MS = 3_000;
const MAX_RATING = 5;

export interface AppStoreListing {
  /** Average stars, or null while the app has no (believable) rating. */
  rating: number | null;
  ratingCount: number;
  version: string;
  releaseNotes: string[];
  /** ISO timestamp of the current version's release. */
  releasedAt: string | null;
  minimumOsVersion: string | null;
}

const lookupResultSchema = z.object({
  version: z.string().min(1),
  averageUserRating: z.number().optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  releaseNotes: z.string().optional(),
  currentVersionReleaseDate: z.string().optional(),
  minimumOsVersion: z.string().optional(),
});

const lookupSchema = z.object({
  results: z.array(z.unknown()),
});

/** One bullet per line, with the listing's own bullet characters removed. */
export function splitReleaseNotes(notes: string): string[] {
  return notes
    .split("\n")
    .map((line) => line.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

export function parseAppStoreLookup(body: unknown): AppStoreListing | null {
  const lookup = lookupSchema.safeParse(body);
  if (!lookup.success || lookup.data.results.length === 0) return null;

  const result = lookupResultSchema.safeParse(lookup.data.results[0]);
  if (!result.success) return null;

  const app = result.data;
  const ratingCount = app.userRatingCount ?? 0;
  const rating = app.averageUserRating;
  const hasRating =
    ratingCount > 0 && rating !== undefined && rating > 0 && rating <= MAX_RATING;

  return {
    rating: hasRating ? rating : null,
    ratingCount,
    version: app.version,
    releaseNotes: app.releaseNotes ? splitReleaseNotes(app.releaseNotes) : [],
    releasedAt: app.currentVersionReleaseDate ?? null,
    minimumOsVersion: app.minimumOsVersion ?? null,
  };
}

/** "Oct 16, 2026" in the store's own time zone, or null for a bad date. */
export function formatReleaseDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}

export async function fetchAppStoreListing(): Promise<AppStoreListing | null> {
  try {
    const response = await fetch(LOOKUP_URL, {
      next: { revalidate: LISTING_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[download] App Store lookup answered ${response.status}`);
      return null;
    }
    return parseAppStoreLookup(await response.json());
  } catch (error: unknown) {
    console.error("[download] App Store lookup failed", error);
    return null;
  }
}
