// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
    isSentryEnabled,
    sentryEnvironment,
    SENTRY_IGNORE_ERRORS,
    SENTRY_DENY_URLS,
    filterSentryEvent,
} from "@/lib/sentry-filtering";

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Only deliver events from real deployments. This keeps the local Turbopack
    // dev server's HMR/devtools noise out of the dashboard. Override locally
    // with NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true.
    enabled: isSentryEnabled(),
    environment: sentryEnvironment,

    // Drop known framework/network/extension noise (see src/lib/sentry-filtering.ts).
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    denyUrls: SENTRY_DENY_URLS,
    beforeSend: filterSentryEvent,

    // Add optional integrations for additional features
    integrations: [Sentry.replayIntegration()],

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
