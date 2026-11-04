/**
 * After the app changes the business-day cutoff (`setBusinessDayCutoff`, a
 * direct RPC), a Convex store's deployment, or a store's own Supabase order
 * database, still holds the old schedule, and it numbers that store's orders
 * (#01) by it. Only the web can write those backends, so this asks
 * `POST /api/business-day/sync`, which re-pushes the STORED schedule.
 *
 * Never throws and never blocks the save: the change starts tomorrow at the
 * earliest, and every later config sync or deploy carries it too. Platform
 * stores number orders in the database trigger, so nothing is sent.
 */
import { postAuthorized } from "../authorized-post";

export const BUSINESS_DAY_SYNC_PATH = "/api/business-day/sync";

/** The backends that keep their own copy of the schedule. */
const BACKENDS_WITH_A_COPY = new Set(["convex", "supabase"]);

/** True when the push was accepted (or not needed); false when it should be retried later. */
export async function pushCutoffToOrderBackend(
  tenantId: string,
  orderBackend: string | null | undefined
): Promise<boolean> {
  if (!orderBackend || !BACKENDS_WITH_A_COPY.has(orderBackend)) return true;
  try {
    return await postAuthorized(BUSINESS_DAY_SYNC_PATH, { tenantId });
  } catch {
    return false;
  }
}
