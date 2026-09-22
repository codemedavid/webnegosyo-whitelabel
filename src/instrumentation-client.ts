// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { installResourceFailureDiagnostics } from '@/lib/client-resource-diagnostics';
import {
    isSentryEnabled,
    sentryEnvironment,
    SENTRY_IGNORE_ERRORS,
    SENTRY_DENY_URLS,
    filterSentryClientEvent,
} from "@/lib/sentry-filtering";

installResourceFailureDiagnostics();

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Only deliver events from real deployments. This keeps the local Turbopack
    // dev server's HMR/devtools noise out of the dashboard. Override locally
    // with NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true.
    enabled: isSentryEnabled(),
    environment: sentryEnvironment,

    // Keep actionable production errors and attach storefront/admin context.
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    denyUrls: SENTRY_DENY_URLS,
    beforeSend: filterSentryClientEvent,

    // Session Replay is NOT listed here on purpose — see `loadSessionReplay`
    // below. Naming it as an integration pulls rrweb into the first chunk
    // every page loads.

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),

    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // PII collection (IPs, cookies, user data) is disabled by default to comply with
    // privacy regulations (GDPR, etc.). Only enable via NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII=true
    // after ensuring proper user consent is in place.
    sendDefaultPii: process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII === "true",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/** Wait for the browser to go quiet; `requestIdleCallback` is absent on Safari. */
const IDLE_FALLBACK_DELAY_MS = 2000;

function whenIdle(run: () => void): void {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: IDLE_FALLBACK_DELAY_MS });
        return;
    }
    window.setTimeout(run, IDLE_FALLBACK_DELAY_MS);
}

/**
 * Attach Session Replay after the page is interactive, from Sentry's CDN.
 *
 * Bundling `replayIntegration()` put rrweb in the chunk shared by every route:
 * 159 kB of the 382 kB every visitor downloaded, including on pages that are
 * otherwise static marketing HTML (`/university`, `/download`). Loading it on
 * idle takes that off the critical path.
 *
 * The trade-off is deliberate and worth naming: replay now starts a moment
 * after load rather than at the first byte, so an error thrown in those first
 * seconds is reported without a recording. Errors themselves are unaffected —
 * `Sentry.init` above still runs first thing.
 */
function loadSessionReplay(): void {
    if (typeof window === "undefined" || !isSentryEnabled()) return;

    whenIdle(() => {
        Sentry.lazyLoadIntegration("replayIntegration")
            .then((replayIntegration) => {
                // Defaults unchanged from the bundled integration: all text
                // masked, all media blocked.
                Sentry.addIntegration(replayIntegration());
            })
            .catch(() => {
                // The CDN is blocked or offline. Replay is a diagnostic extra;
                // losing it must never break the page or the error reporting.
            });
    });
}

loadSessionReplay();

// Suppress Convex "function not found" errors that fire asynchronously via
// WebSocket. These are NOT catchable by React error boundaries because they
// originate outside the React render cycle. The SafeConvexProvider error
// boundary handles the render-time re-throw; this handler prevents the
// initial async throw from crashing the entire Next.js app.
if (typeof window !== "undefined") {
    const isConvexFunctionNotFound = (msg: string) =>
        msg.includes("Could not find public function");

    window.addEventListener("error", (event) => {
        if (isConvexFunctionNotFound(event.message ?? "")) {
            event.preventDefault();
            console.warn("[Convex] Function not deployed, suppressed:", event.message);
        }
    });

    window.addEventListener("unhandledrejection", (event) => {
        const msg = event.reason?.message ?? String(event.reason ?? "");
        if (isConvexFunctionNotFound(msg)) {
            event.preventDefault();
            console.warn("[Convex] Function not deployed, suppressed:", msg);
        }
    });
}
