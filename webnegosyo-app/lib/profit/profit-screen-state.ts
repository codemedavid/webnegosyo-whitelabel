/**
 * Which of its states the Profit screen is in — locked, not set up, loading,
 * failed, or ready (with a quiet note when only a refresh failed). Pure.
 *
 * A passing failure ("failed") is THROWN by the read (`settleProfit`), so the
 * shared cache keeps the last good answer and reports the error beside it
 * instead of replacing a profit the owner was reading with an error card.
 */

import type { ProfitScreenData } from "./profit-service";
import { PROFIT_LOCKED_MESSAGE, PROFIT_PLATFORM_ONLY_MESSAGE } from "./profit-view";

export type ReadyProfit = Extract<ProfitScreenData, { status: "ready" }>;

export type ProfitScreenState =
  | { kind: "locked"; message: string }
  | { kind: "not_set_up"; message: string }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReadyProfit; refreshError: string | null };

export interface ProfitScreenInput {
  isAllowed: boolean;
  isPlatform: boolean;
  data: ProfitScreenData | undefined;
  isLoading: boolean;
  error: string | null;
}

export const PROFIT_LOAD_FALLBACK = "Profit couldn’t load. Check your connection and try again.";

export function profitScreenState({ isAllowed, isPlatform, data, isLoading, error }: ProfitScreenInput): ProfitScreenState {
  if (!isAllowed) return { kind: "locked", message: PROFIT_LOCKED_MESSAGE };
  if (data?.status === "locked") return { kind: "locked", message: data.message };
  if (!isPlatform) return { kind: "not_set_up", message: PROFIT_PLATFORM_ONLY_MESSAGE };
  if (data?.status === "not_set_up") return { kind: "not_set_up", message: data.message };
  if (data?.status === "ready") return { kind: "ready", data, refreshError: error };
  if (isLoading) return { kind: "loading" };
  if (data) return { kind: "error", message: data.message };
  if (error) return { kind: "error", message: error };
  return { kind: "loading" };
}

/** The read's last step: a passing failure becomes an error the cache can hold beside old data. */
export function settleProfit(result: ProfitScreenData): ProfitScreenData {
  if (result.status === "failed") throw new Error(result.message);
  return result;
}
