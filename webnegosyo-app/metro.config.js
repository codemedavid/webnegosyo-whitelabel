/* eslint-disable @typescript-eslint/no-require-imports -- Node configuration is loaded as CommonJS. */
// Sentry's Metro wrapper stamps each bundle with a debug ID so the source maps
// uploaded for a build or an `eas update` match the stack traces it reports.
// Otherwise identical to Expo's default config.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
