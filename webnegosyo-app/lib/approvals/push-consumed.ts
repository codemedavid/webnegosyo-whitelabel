/**
 * Push responses the app has already acted on — persisted, so a cold start
 * never replays one (security review M7). `getLastNotificationResponseAsync`
 * hands back the same Approve after a kill and reopen on binaries without
 * `clearLastNotificationResponse`; without this list, Undo followed by a
 * restart would approve anyway, 4 seconds later. Pure apart from the
 * injected key-value store (AsyncStorage in the app).
 *
 * Second guard: an Approve whose notification is older than two minutes is
 * opened WITHOUT the approving countdown — the person decides on the screen.
 */
import { approvalHref, approvalTargetFromPush, routeFromPushResponse } from "./push-route";

export const CONSUMED_STORAGE_KEY = "approvals:consumed-push-responses";
export const CONSUMED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_AUTO_COMMIT_AGE_MS = 2 * 60 * 1000;
/** Below this a delivery time is in seconds, not milliseconds. */
const SECONDS_CUTOFF = 1e12;

export interface KeyValueStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface ConsumedRead {
  status: "read" | "unknown";
  /** Empty when unknown. */
  keys: readonly string[];
}

function parse(raw: string | null, now: number): Record<string, number> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number" && now - entry[1] <= CONSUMED_TTL_MS,
      ),
    );
  } catch {
    return {};
  }
}

/** The responses handled in the last 7 days; "unknown" when storage could not be read. */
export async function readConsumed(store: KeyValueStore, now: number): Promise<ConsumedRead> {
  try {
    return { status: "read", keys: Object.keys(parse(await store.getItem(CONSUMED_STORAGE_KEY), now)) };
  } catch {
    return { status: "unknown", keys: [] };
  }
}

/** Records a handled response (pruning anything older than 7 days). Never throws. */
export async function rememberConsumed(store: KeyValueStore, key: string, now: number): Promise<void> {
  try {
    const current = parse(await store.getItem(CONSUMED_STORAGE_KEY), now);
    await store.setItem(CONSUMED_STORAGE_KEY, JSON.stringify({ ...current, [key]: now }));
  } catch {
    // The in-memory guard and the 2-minute rule still hold for this run.
  }
}

export interface PushRouteInput {
  data: unknown;
  actionIdentifier: string | null;
  /** `${notification identifier}:${action}` */
  key: string;
  /** `notification.date` (ms; seconds tolerated). */
  notifiedAt: number;
  now: number;
  consumed: ConsumedRead;
}

/** Where a response opens, or null when it was already handled. */
export function planPushRoute(input: PushRouteInput): string | null {
  if (input.consumed.keys.includes(input.key)) return null;
  const target = approvalTargetFromPush(input.data, input.actionIdentifier);
  if (target?.intent === "approve") {
    const deliveredAt = input.notifiedAt < SECONDS_CUTOFF ? input.notifiedAt * 1000 : input.notifiedAt;
    const isStale = input.now - deliveredAt > MAX_AUTO_COMMIT_AGE_MS;
    if (isStale || input.consumed.status === "unknown") return approvalHref({ ...target, intent: null });
  }
  return routeFromPushResponse(input.data, input.actionIdentifier);
}
