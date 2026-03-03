// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: (() => {
      const parsed = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");
      return Number.isFinite(parsed) ? parsed : 0.1;
    })(),

    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // PII collection (IPs, cookies, user data) is disabled by default to comply with
    // privacy regulations (GDPR, etc.). Only enable via SENTRY_SEND_DEFAULT_PII=true
    // after ensuring proper user consent is in place.
    sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === "true",
});
