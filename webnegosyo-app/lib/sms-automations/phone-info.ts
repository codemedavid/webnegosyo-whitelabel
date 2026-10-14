/**
 * What this sending phone tells the web's Texts page about itself, on its
 * outbox claim (`x-wn-phone-info`). Pure.
 *
 * A header, not a body field: the claim route refuses unknown body keys, so
 * a body field would 400 on an older server, while an older server simply
 * ignores a header. The web records it only after the claim authenticated
 * this phone. Sent on the first claim after start, then every 6 hours, and
 * again when the app version changes. Every field is optional: one that
 * could not be read is left out, never guessed.
 */

export const PHONE_INFO_HEADER = "x-wn-phone-info";
export const PHONE_INFO_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Collecting must never hold a claim up. */
export const PHONE_INFO_COLLECT_TIMEOUT_MS = 1_500;
const MAX_TEXT = 60;

export type PhoneInfo = {
  manufacturer?: string;
  model?: string;
  os?: string;
  app?: string;
  sms?: boolean;
  /** true = battery saver leaves the app alone ("Unrestricted"). */
  bat?: boolean;
};

const TEXT_KEYS = ["manufacturer", "model", "os", "app"] as const;
const FLAG_KEYS = ["sms", "bat"] as const;

/** Keeps the fields that are the right type; trims and bounds text. */
export function toPhoneInfo(raw: Record<string, unknown>): PhoneInfo {
  const texts = TEXT_KEYS.flatMap((key) => {
    const value = raw[key];
    const text = typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
    return text ? [[key, text] as const] : [];
  });
  const flags = FLAG_KEYS.flatMap((key) => (typeof raw[key] === "boolean" ? [[key, raw[key]] as const] : []));
  return Object.fromEntries([...texts, ...flags]) as PhoneInfo;
}

/** The header value, or null when there is nothing to report. */
export function encodePhoneInfo(info: PhoneInfo): string | null {
  return Object.keys(info).length === 0 ? null : encodeURIComponent(JSON.stringify(info));
}

export type PhoneInfoReporter = {
  /** The header to send on this claim, or null (not due, or nothing readable). Never throws. */
  next(): Promise<string | null>;
  /** The claim carrying the last header succeeded. */
  sent(): void;
};

export type PhoneInfoReporterDeps = {
  collect: () => Promise<Record<string, unknown>>;
  /** Cheap and synchronous: checked on every claim. */
  appVersion: () => string | null;
  now: () => number;
  intervalMs?: number;
  collectTimeoutMs?: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createPhoneInfoReporter(deps: PhoneInfoReporterDeps): PhoneInfoReporter {
  const intervalMs = deps.intervalMs ?? PHONE_INFO_INTERVAL_MS;
  const timeoutMs = deps.collectTimeoutMs ?? PHONE_INFO_COLLECT_TIMEOUT_MS;
  let lastSent: { at: number; version: string | null } | null = null;
  let pendingVersion: string | null | undefined;

  const isDue = (version: string | null) =>
    lastSent === null || deps.now() - lastSent.at >= intervalMs || version !== lastSent.version;

  return {
    async next() {
      try {
        const version = deps.appVersion();
        if (!isDue(version)) return null;
        const raw = await withTimeout(deps.collect(), timeoutMs);
        const header = raw ? encodePhoneInfo(toPhoneInfo(raw)) : null;
        pendingVersion = header ? version : undefined;
        return header;
      } catch {
        return null;
      }
    },
    sent() {
      if (pendingVersion === undefined) return;
      lastSent = { at: deps.now(), version: pendingVersion };
      pendingVersion = undefined;
    },
  };
}
