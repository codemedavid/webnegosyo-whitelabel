import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useAuthStore } from "../../stores/auth-store";
import {
  isSentryEnabled,
  scrubBreadcrumb,
  scrubEvent,
  sentryEnvironment,
  sentryScopeFromAuth,
  type SentryAuthSlice,
} from "./sentry-config";

/**
 * Crash and error reporting. Imported first thing in `index.ts` so native
 * crashes and errors thrown while the router boots are caught too.
 *
 * What reaches Sentry:
 *  - native crashes (iOS/Android) and fatal JS errors, by the SDK itself;
 *  - render throws, from the root `ErrorBoundary` in app/_layout.tsx — React
 *    hands those to the boundary, so the SDK never sees them on its own;
 *  - async throws, from `useGlobalErrorHandler`, which deliberately swallows
 *    them in release builds and so bypasses the SDK's own global handler.
 *
 * The OTA update id and channel are attached by the SDK's Expo integration, so
 * an error can be traced to the exact `eas update` that shipped it.
 */

const dsn: string = Constants.expoConfig?.extra?.sentryDsn ?? "";

const enabled = isSentryEnabled({
  dsn,
  isDev: __DEV__,
  forceEnable: process.env.EXPO_PUBLIC_SENTRY_FORCE_ENABLE === "true",
});

Sentry.init({
  dsn,
  enabled,
  environment: sentryEnvironment({ isDev: __DEV__, channel: Updates.channel }),
  // Off: IPs and device names are not needed to fix a crash. The account is
  // identified by id only, below.
  sendDefaultPii: false,
  // Screenshots would capture customer names and order totals on the register.
  attachScreenshot: false,
  // Errors only for now; performance tracing can be switched on later.
  tracesSampleRate: 0,
  // Request URLs carry PostgREST filters (a customer's phone number) and
  // console lines can quote contacts; neither may ride along with an event.
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  beforeSend: (event) => scrubEvent(event),
});

function pickAuth(state: SentryAuthSlice): SentryAuthSlice {
  return {
    userId: state.userId,
    tenantId: state.tenantId,
    tenantSlug: state.tenantSlug,
    outletId: state.outletId,
    role: state.role,
    orderBackend: state.orderBackend,
    isDemo: state.isDemo,
    isSuperadmin: state.isSuperadmin,
    impersonatedTenantId: state.impersonatedTenantId,
  };
}

function applyAuthScope(state: SentryAuthSlice): void {
  const scope = sentryScopeFromAuth(pickAuth(state));
  Sentry.setUser(scope.user);
  Sentry.setTags(scope.tags);
}

// Keep every event labelled with the store and branch it happened in. The
// store changes on sign-in, sign-out and superadmin impersonation.
if (enabled) {
  applyAuthScope(useAuthStore.getState());
  useAuthStore.subscribe(applyAuthScope);
}

/** Report an error a screen has already handled (shown a fallback for, etc.). */
export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { tags: context } : undefined);
}

export const wrapRootComponent = Sentry.wrap;
