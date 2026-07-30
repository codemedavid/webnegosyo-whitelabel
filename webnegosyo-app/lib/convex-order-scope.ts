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
 * Order reads whose v15 validator accepts `outletId`.
 *
 * Adding a ref here without adding the parameter to the Convex template blanks
 * the screen for every tenant not yet on v15, so the set is pinned by a test.
 */
export const CONVEX_BRANCH_SCOPED_REFS: ReadonlySet<string> = new Set([
  "orders:getOrders",
  "orders:getRealtimeQueue",
]);

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
): Record<string, unknown> | "skip" {
  if (args === "skip") return "skip";

  // The scope decides the branch, never the caller: a stale literal left in a
  // screen's arguments must not narrow an owner's view.
  const rest = Object.fromEntries(
    Object.entries(args ?? {}).filter(([key]) => key !== "outletId"),
  );

  if (scope.kind === "all") return rest;
  if (!CONVEX_BRANCH_SCOPED_REFS.has(refName)) return rest;

  return { ...rest, outletId: scope.outletId };
}
