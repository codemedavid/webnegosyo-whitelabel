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
