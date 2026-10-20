/**
 * Reading the Senior/PWD sales book for one period, and recording a review —
 * always with the SIGNED-IN user's session.
 *
 * `gov_discount_claims` is readable only by owners, full-access staff and
 * holders of `discount_review`, and a branch-locked reviewer sees only their
 * branch. Reading as the caller lets RLS decide all of that, so this screen
 * cannot show more than the policy allows. A review's reviewer is stamped by
 * the database trigger from `auth.uid()`; the app never sends one.
 *
 * Every read is bounded: the window on `(tenant_id, occurred_at)` (indexed),
 * paged past the 1000-row API cap, and capped. Callers get `isTruncated`.
 */

import { supabase } from "../supabase";
import { readAllPages, type PageResponse } from "./paging";
import type { GovReportPeriod } from "./period";
import { CLAIM_COLUMNS, REVERSAL_COLUMNS, REVIEW_COLUMNS, mapRows, toLedgerClaim, toLedgerReview, toReversalStamp, type Row } from "./rows";
import type { LedgerClaim, LedgerReview, ReversalStamp, ReviewVerdict } from "./types";
import type { IdPhotoRef } from "./id-photos";

export const MAX_LEDGER_ROWS = 5_000;
const MAX_LATER_REVERSALS = 5_000;
const MAX_REVIEW_ROWS = 5_000;
/** Photos are opt-in and live 90 days, so this is never close in practice. */
const MAX_ID_PHOTO_ROWS = 5_000;
const PAGE_SIZE = 1000;
/** Slack for a register clock running ahead of the database's. */
const REVIEW_CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;

export interface GovLedgerData {
  rows: LedgerClaim[];
  laterReversals: ReversalStamp[];
  reviews: LedgerReview[];
  /** True when a cap was hit: totals would be incomplete. */
  isTruncated: boolean;
  /** The optional ID photos this reviewer may open. */
  idPhotos: IdPhotoRef[];
}

const asPage = (response: { data: unknown; error: { message: string } | null }): PageResponse<Row> => ({
  data: (response.data as Row[] | null) ?? null,
  error: response.error,
});

async function loadWindow(tenantId: string, period: GovReportPeriod) {
  const result = await readAllPages<Row>(
    (from, to) =>
      supabase
        .from("gov_discount_claims")
        .select(CLAIM_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("occurred_at", period.startIso)
        .lt("occurred_at", period.endIso)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .then(asPage),
    { pageSize: PAGE_SIZE, maxRows: MAX_LEDGER_ROWS },
  );
  return { rows: mapRows(result.rows, toLedgerClaim), isTruncated: result.isTruncated };
}

/** Reversals recorded AFTER the window, so an old grant shows it was taken back. */
async function loadLaterReversals(tenantId: string, period: GovReportPeriod, nowMs: number) {
  if (Date.parse(period.endIso) > nowMs) return { rows: [] as ReversalStamp[], isTruncated: false };
  const result = await readAllPages<Row>(
    (from, to) =>
      supabase
        .from("gov_discount_claims")
        .select(REVERSAL_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("event", "reversed")
        .gte("occurred_at", period.endIso)
        .order("occurred_at", { ascending: true })
        .range(from, to)
        .then(asPage),
    { pageSize: PAGE_SIZE, maxRows: MAX_LATER_REVERSALS },
  );
  return { rows: result.rows.map(toReversalStamp), isTruncated: result.isTruncated };
}

/**
 * Reviews of the window's grants. A review is always written after its grant,
 * so every relevant one was created on or after the window's start (less a day
 * of slack) — one indexed read on (tenant_id, created_at) instead of an IN list.
 */
async function loadReviews(tenantId: string, period: GovReportPeriod, grantIds: ReadonlySet<string>) {
  if (grantIds.size === 0) return { rows: [] as LedgerReview[], isTruncated: false };
  const sinceIso = new Date(Date.parse(period.startIso) - REVIEW_CLOCK_SLACK_MS).toISOString();
  const result = await readAllPages<Row>(
    (from, to) =>
      supabase
        .from("gov_discount_reviews")
        .select(REVIEW_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .range(from, to)
        .then(asPage),
    { pageSize: PAGE_SIZE, maxRows: MAX_REVIEW_ROWS },
  );
  const reviews = mapRows(result.rows, toLedgerReview).filter((review) => grantIds.has(review.claimId));
  return { rows: reviews, isTruncated: result.isTruncated };
}

/**
 * Every ID photo this reviewer may see (RLS: reviewers only, unexpired). A
 * failure hides the photos, never the sales book.
 */
async function loadIdPhotos(tenantId: string): Promise<IdPhotoRef[]> {
  try {
    const result = await readAllPages<Row>(
      (from, to) =>
        supabase
          .from("gov_discount_id_photos")
          .select("id, backend, external_order_id, claimant_ref")
          .eq("tenant_id", tenantId)
          .order("captured_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .then(asPage),
      { pageSize: PAGE_SIZE, maxRows: MAX_ID_PHOTO_ROWS },
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      backend: String(row.backend),
      externalOrderId: String(row.external_order_id),
      claimantRef: String(row.claimant_ref),
    }));
  } catch {
    return [];
  }
}

export async function fetchGovLedger(
  tenantId: string,
  period: GovReportPeriod,
  nowMs: number,
): Promise<GovLedgerData> {
  const [window, later, idPhotos] = await Promise.all([
    loadWindow(tenantId, period),
    loadLaterReversals(tenantId, period, nowMs),
    loadIdPhotos(tenantId),
  ]);
  const grantIds = new Set(window.rows.filter((row) => row.event === "granted").map((row) => row.id));
  const reviews = await loadReviews(tenantId, period, grantIds);
  return {
    rows: window.rows,
    laterReversals: later.rows,
    reviews: reviews.rows,
    isTruncated: window.isTruncated || later.isTruncated || reviews.isTruncated,
    idPhotos,
  };
}

export interface ReviewWrite {
  tenantId: string;
  claimId: string;
  verdict: ReviewVerdict;
  note: string | null;
}

const RLS_REFUSAL = "42501";

/** Appends one verdict. The database stamps who reviewed it and when. */
export async function submitGovReview(write: ReviewWrite): Promise<void> {
  const { data, error } = await supabase
    .from("gov_discount_reviews")
    .insert({ tenant_id: write.tenantId, claim_id: write.claimId, verdict: write.verdict, note: write.note })
    .select("id");
  if (error) {
    if (error.code === RLS_REFUSAL) {
      throw new Error("Your account cannot review Senior/PWD discounts. Ask the owner for the review permission.");
    }
    throw new Error("Could not save your review. Check your connection and try again.");
  }
  // RLS refusals can be silent: the read policy matches the insert policy, so a
  // review that really landed always comes back. Nothing back = not recorded.
  if (!data || data.length === 0) {
    throw new Error("Your review was not recorded. Try again.");
  }
}
