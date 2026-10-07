/**
 * Pure decisions behind the Sentry setup in `./index.ts`: whether to send at
 * all, which environment to file events under, and what identifies the account
 * on each event. Kept free of the SDK so it runs in the node test suite.
 */

/**
 * Tag value for "not set". Sentry has no way to unset a tag on the global
 * scope, so every key is always written — a signed-out device would otherwise
 * keep reporting under the previous store's tenant_id.
 */
export const NO_VALUE_TAG = "none";

interface EnabledInput {
  dsn: string;
  isDev: boolean;
  /** `EXPO_PUBLIC_SENTRY_FORCE_ENABLE=true`, to debug Sentry from a dev build. */
  forceEnable: boolean;
}

/**
 * Release builds only, matching the web app (src/lib/sentry-filtering.ts):
 * Metro reloads and red-box errors in development are noise, not incidents.
 */
export function isSentryEnabled({ dsn, isDev, forceEnable }: EnabledInput): boolean {
  if (dsn.trim() === "") return false;
  return !isDev || forceEnable;
}

interface EnvironmentInput {
  isDev: boolean;
  /** `expo-updates` channel baked into the build (production, preview, …). */
  channel: string | null;
}

export function sentryEnvironment({ isDev, channel }: EnvironmentInput): string {
  if (channel) return channel;
  return isDev ? "development" : "production";
}

/** The slice of `stores/auth-store.ts` an event is labelled with. */
export interface SentryAuthSlice {
  userId: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  outletId: string | null;
  role: string | null;
  orderBackend: string | null;
  isDemo: boolean;
  isSuperadmin: boolean;
  impersonatedTenantId: string | null;
}

export interface SentryScope {
  user: { id: string } | null;
  tags: Record<string, string>;
}

/**
 * The account appears by its opaque id only. Staff emails and phone numbers
 * never leave the device — the id is enough to look the person up in Supabase.
 */
export function sentryScopeFromAuth(auth: SentryAuthSlice): SentryScope {
  const tag = (value: string | null) => value ?? NO_VALUE_TAG;
  return {
    user: auth.userId ? { id: auth.userId } : null,
    tags: {
      tenant_id: tag(auth.tenantId),
      tenant_slug: tag(auth.tenantSlug),
      outlet_id: tag(auth.outletId),
      role: tag(auth.role),
      order_backend: tag(auth.orderBackend),
      demo: String(auth.isDemo),
      superadmin: String(auth.isSuperadmin),
      impersonated_tenant_id: tag(auth.impersonatedTenantId),
    },
  };
}

/** The parts of a Sentry breadcrumb this module reads and rewrites. */
export interface BreadcrumbLike {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

const REQUEST_CATEGORIES: ReadonlySet<string> = new Set(["xhr", "fetch", "http"]);

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/**
 * Philippine mobile numbers in their usual spellings (+63 917…, 0917…). The
 * leading group keeps a uuid's last segment (`-000000000001`) from matching.
 */
const PHONE_PATTERN = /(^|[^\w-])((?:\+?63|0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4})(?![\w-])/g;

function redactContacts(text: string): string {
  return text.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "$1[phone]");
}

function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Strip customer contact details from a breadcrumb before it can ride along
 * with an event. PostgREST puts filters in the query string — the customer
 * lookup sends `phone_e164=eq.+63…` — and the SDK records every request URL,
 * so request breadcrumbs lose their query and fragment; free-text messages
 * (console lines) have emails and phone numbers masked. Returns a new object.
 */
export function scrubBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T): T {
  const next: T = { ...breadcrumb };
  if (typeof next.message === "string") next.message = redactContacts(next.message);
  if (next.data && REQUEST_CATEGORIES.has(next.category ?? "") && typeof next.data.url === "string") {
    next.data = { ...next.data, url: withoutQuery(next.data.url) };
  }
  return next;
}

/** The parts of a Sentry event whose free text may quote a customer. */
export interface EventLike {
  message?: string;
  exception?: { values?: { value?: string }[] };
}

/**
 * Mask emails and phone numbers in an event's message and exception texts.
 * Database errors quote the offending row (`Key (phone_e164)=(+63…)`), and a
 * screen's error string can name the customer it failed for. Returns a copy.
 */
export function scrubEvent<T extends EventLike>(event: T): T {
  const next: T = { ...event };
  if (typeof next.message === "string") next.message = redactContacts(next.message);
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((value) =>
        typeof value.value === "string" ? { ...value, value: redactContacts(value.value) } : value
      ),
    };
  }
  return next;
}
