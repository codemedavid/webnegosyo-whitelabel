/**
 * Asking a Convex order query for a single branch.
 *
 * Before schema v15 the Convex path fetched every branch's orders and each
 * screen discarded the rows it could not show, so a branch manager's device
 * received other branches' customer names and phone numbers over the wire. The
 * v15 order reads accept an `outletId`, which moves that narrowing to the query.
 *
 * **Why this is conditional rather than always sent.** A Convex deployment
 * running an older bundle rejects an argument its validator does not know, and
 * `hooks.ts` reads that rejection as "this store needs a backend update" and
 * shows a placeholder instead of the orders. Most tenants run several versions
 * behind head. So the argument goes out only when it is actually needed — for a
 * branch-scoped account, which by definition only exists on a tenant that has
 * branches, and therefore on one deployed to v15. Every other tenant keeps
 * sending exactly the arguments it sends today.
 *
 * This narrowing is a bandwidth and privacy improvement, **not** a security
 * boundary: no Convex function in the template authenticates its caller, so the
 * argument can simply be omitted by anyone holding the deployment URL. The
 * client-side filter stays in place; this reduces what crosses the wire in the
 * normal case rather than enforcing anything.
 */
import type { BranchScope } from "./branch-scope";

/**
 * Order reads whose validator accepts `outletId`, and the schema version in
 * which each learned it.
 *
 * Adding a ref here without adding the parameter to the Convex template blanks
 * the screen for every tenant below that version, so the set is pinned by a
 * test.
 *
 * **Why the v15 pair is recorded as 0 rather than 15.** The reasoning in the
 * header holds for them: a branch-scoped account only exists on a tenant that
 * has branches, and therefore on one deployed to v15. Version-gating them now
 * would REMOVE narrowing from tenants whose version this app has never had to
 * know, which is a regression in what crosses the wire.
 *
 * That reasoning does not extend to v18. A tenant can have branches and still
 * be running v15, v16 or v17, so the stats query has to be gated for real.
 */
/** The bundle in which `getDashboardStatsByPeriod` learned `outletId`. */
export const BRANCH_STATS_SCHEMA_VERSION = 18;

const BRANCH_SCOPED_REF_MIN_VERSION: ReadonlyMap<string, number> = new Map([
  ["orders:getOrders", 0],
  ["orders:getRealtimeQueue", 0],
  ["orders:getDashboardStatsByPeriod", BRANCH_STATS_SCHEMA_VERSION],
]);

/** Every ref that can be narrowed at all, whatever the version it needs. */
export const CONVEX_BRANCH_SCOPED_REFS: ReadonlySet<string> = new Set(
  BRANCH_SCOPED_REF_MIN_VERSION.keys(),
);

/** Convex's sentinel for a query that must not run. */
type QueryArgs = Record<string, unknown> | "skip" | undefined;

/**
 * The arguments to send for `refName`, narrowed to the account's branch.
 *
 * For a store-wide account the result is the caller's own arguments with no key
 * added — not `outletId: undefined`, which the validator would still see.
 */
export function convexOrderQueryArgs(
  refName: string,
  args: QueryArgs,
  scope: BranchScope,
  schemaVersion?: number | null,
): Record<string, unknown> | "skip" {
  if (args === "skip") return "skip";

  // The scope decides the branch, never the caller: a stale literal left in a
  // screen's arguments must not narrow an owner's view.
  const rest = Object.fromEntries(
    Object.entries(args ?? {}).filter(([key]) => key !== "outletId"),
  );

  if (scope.kind === "all") return rest;

  const minVersion = BRANCH_SCOPED_REF_MIN_VERSION.get(refName);
  if (minVersion === undefined) return rest;

  // An unknown version counts as the oldest: a tenant whose version was never
  // recorded was most likely deployed before versions were tracked.
  if ((schemaVersion ?? 0) < minVersion) return rest;

  return { ...rest, outletId: scope.outletId };
}
