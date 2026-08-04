/**
 * One bar, five bands: how much of the guest list the merchant can actually
 * reach, and what is standing in the way of the rest.
 *
 * This replaces a row of four stat tiles. Four counts printed side by side are
 * four facts; a proportional bar is the one fact underneath them — the share
 * of the list that is reachable — plus a way in to each obstacle. Every band
 * the list can narrow to carries the filter that narrows it, so the readout
 * and the control are the same object.
 *
 * **`CustomerListStats` does not count suppressed guests.** It carries total,
 * textable, noConsent, optedOut and noPhone, and a guest whose number sits on
 * the tenant suppression list falls into none of them. So the four named
 * counts can sum to less than `total`, and a bar that divides each one by the
 * total leaves a gap nothing on screen explains. The remainder is recovered
 * here as an explicit blocked band.
 */

import type {
  CustomerListFilter,
  CustomerListStats,
  ReachabilityStatus,
} from "./customer-list";

export interface ReachSegment {
  status: ReachabilityStatus;
  /** The merchant-facing name of this band. Matches the row badges exactly. */
  label: string;
  count: number;
  /** This band's share of the whole database, 0–1. The bands always sum to 1. */
  share: number;
  /**
   * The list filter this band narrows to, or `null` when the list has no
   * filter for it. Tapping an unfilterable band must do nothing rather than
   * silently narrow to something else.
   */
  filter: CustomerListFilter | null;
}

/**
 * Order is deliberate and never sorted by size: reachable first, then the
 * obstacles in the order the merchant can do something about them. A bar that
 * reorders itself as counts change is a bar nobody can read at a glance.
 */
const BANDS: {
  status: ReachabilityStatus;
  label: string;
  filter: CustomerListFilter | null;
  countOf: (stats: CustomerListStats) => number;
}[] = [
  {
    status: "textable",
    label: "Can text",
    filter: "textable",
    countOf: (stats) => stats.textable,
  },
  {
    status: "no_consent",
    label: "Not opted in",
    filter: "no_consent",
    countOf: (stats) => stats.noConsent,
  },
  {
    status: "opted_out",
    label: "Opted out",
    filter: "opted_out",
    countOf: (stats) => stats.optedOut,
  },
  {
    status: "no_phone",
    label: "No number",
    filter: "no_phone",
    countOf: (stats) => stats.noPhone,
  },
];

export function buildReachSegments(stats: CustomerListStats): ReachSegment[] {
  if (stats.total <= 0) return [];

  const named = BANDS.map((band) => ({
    status: band.status,
    label: band.label,
    filter: band.filter,
    count: band.countOf(stats),
  }));

  const accountedFor = named.reduce((sum, band) => sum + band.count, 0);
  const blocked = Math.max(0, stats.total - accountedFor);

  const all = [
    ...named,
    // Suppressed at the tenant level. Unfilterable: `CustomerListFilter` has no
    // case for it, and inventing one here would let the bar promise a view the
    // list cannot render.
    { status: "suppressed" as const, label: "Blocked", filter: null, count: blocked },
  ];

  return all
    .filter((band) => band.count > 0)
    .map((band) => ({ ...band, share: band.count / stats.total }));
}

export interface ReachHeadline {
  value: number;
  sentence: string;
}

/**
 * The sentence above the bar.
 *
 * Stated as a share ("12 of 40 guests") rather than a bare count, because a
 * bare 12 reads as an achievement and the point of this screen is the 28.
 */
export function reachHeadline(stats: CustomerListStats): ReachHeadline {
  if (stats.total <= 0) return { value: 0, sentence: "No guests yet" };

  const noun = stats.total === 1 ? "guest" : "guests";
  return {
    value: stats.textable,
    sentence: `of ${stats.total} ${noun} can be texted`,
  };
}
