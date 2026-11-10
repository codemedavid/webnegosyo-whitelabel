// Who may spend the coach's AI budget, and how fast. Pure (dependencies are
// passed in), so jest can reach it without the Deno runtime.
//
// Counts in Upstash when UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN are set as
// secrets on this function (the web app's REST credentials work as they are), so
// every instance shares one count. Without them, or when Redis fails, it counts
// per instance: weaker, since instances come and go, but never unmetered.

const MERCHANT_ROLES = new Set(["admin", "superadmin", "platform_staff"]);
const REDIS_DEADLINE_MS = 1_000;

export function isMerchantRole(role: string | null | undefined): boolean {
  return typeof role === "string" && MERCHANT_ROLES.has(role);
}

export type InstanceCounter = (key: string, windowSec: number) => number;

/** One count per key and window. Expired keys are swept as new ones arrive. */
export function createInstanceCounter(now: () => number = Date.now): InstanceCounter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (key, windowSec) => {
    const at = now();
    for (const [existing, entry] of windows) {
      if (entry.resetAt <= at) windows.delete(existing);
    }
    const count = (windows.get(key)?.count ?? 0) + 1;
    const resetAt = windows.get(key)?.resetAt ?? at + windowSec * 1000;
    windows.set(key, { count, resetAt });
    return count;
  };
}

export interface LimitOptions {
  limit: number;
  windowSec: number;
}

export interface LimitDeps {
  counter: InstanceCounter;
  redis?: { url: string; token: string } | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

async function countInRedis(userId: string, options: LimitOptions, deps: LimitDeps): Promise<number | null> {
  if (!deps.redis) return null;
  const windowIndex = Math.floor((deps.now ?? Date.now)() / (options.windowSec * 1000));
  const key = `rl:growth-coach:${userId}:${windowIndex}`;
  try {
    const response = await (deps.fetchImpl ?? fetch)(`${deps.redis.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, options.windowSec + 1]]),
      signal: AbortSignal.timeout(REDIS_DEADLINE_MS),
    });
    if (!response.ok) return null;
    const replies = await response.json() as Array<{ result?: unknown }>;
    const used = Number(replies?.[0]?.result);
    return Number.isFinite(used) ? used : null;
  } catch {
    return null;
  }
}

/** Whether this user may ask once more. Never throws. */
export async function checkCoachLimit(userId: string, options: LimitOptions, deps: LimitDeps): Promise<boolean> {
  const used = (await countInRedis(userId, options, deps)) ?? deps.counter(userId, options.windowSec);
  return used <= options.limit;
}
