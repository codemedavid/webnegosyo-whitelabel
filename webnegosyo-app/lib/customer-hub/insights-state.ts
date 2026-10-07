/**
 * Which customer section the Reports screen draws.
 *
 * One decision instead of a ladder of `if`s in the screen, because two of its
 * answers look alike and mean opposite things. "off" is the store's own state
 * (a Convex store nobody has switched on). "pending_update" is the app being
 * ahead of the platform: this store is on, and the platform build that serves
 * its dashboard has not landed yet. Saying "not switched on" for the second
 * would send a merchant hunting for a switch that does not exist.
 */

export type InsightsState = "hidden" | "off" | "pending_update" | "loading" | "error" | "ready";

export type InsightsReadResult =
  | { ok: true; hasDashboard: boolean }
  | { ok: false; reason: "disabled" | "forbidden" | "unavailable" };

export interface InsightsStateInput {
  canSeeCustomers: boolean;
  isHubOnLocally: boolean;
  isLoading: boolean;
  hasError: boolean;
  result: InsightsReadResult | undefined;
}

export function resolveInsightsState(input: InsightsStateInput): InsightsState {
  if (!input.canSeeCustomers) return "hidden";
  if (!input.isHubOnLocally) return "off";
  if (input.isLoading) return "loading";
  const { result } = input;
  if (input.hasError || !result) return "error";
  if (!result.ok) {
    if (result.reason === "forbidden") return "hidden";
    if (result.reason === "disabled") return "pending_update";
    return "error";
  }
  return result.hasDashboard ? "ready" : "pending_update";
}
