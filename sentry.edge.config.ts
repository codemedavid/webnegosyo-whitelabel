// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  sentryEnvironment,
  SENTRY_IGNORE_ERRORS,
  filterSentryEvent,
} from "@/lib/sentry-filtering";

Sentry.init({
  // In the edge runtime only NEXT_PUBLIC_* env vars are reliably inlined into
  // the bundle, so fall back to the public DSN to avoid an undefined DSN.
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only deliver events from real deployments. Keeps local dev-server
  // Turbopack/HMR noise out of the dashboard. Override with
  // SENTRY_FORCE_ENABLE=true.
  enabled: isSentryEnabled(),
  environment: sentryEnvironment,

  // Drop known framework/network noise (see src/lib/sentry-filtering.ts).
  ignoreErrors: SENTRY_IGNORE_ERRORS,
  beforeSend: filterSentryEvent,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: (() => {
    const parsed = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");
    return Number.isFinite(parsed) ? parsed : 0.1;
  })(),

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // PII collection (IPs, cookies, user data) is disabled by default to comply with
  // privacy regulations (GDPR, etc.). Only enable via SENTRY_SEND_DEFAULT_PII=true
  // after ensuring proper user consent is in place.
  sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === "true",
});
