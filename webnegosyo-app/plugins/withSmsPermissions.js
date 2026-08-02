const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

// SEND_SMS only. Deliberately NOT READ_SMS/RECEIVE_SMS: reading the inbox would
// make this a "restricted permission" app under every distribution channel and
// buys nothing — campaigns are one-way, and opt-outs are recorded by the
// merchant rather than parsed from replies.
const SMS_PERMISSIONS = ["android.permission.SEND_SMS"];

/**
 * @param {import('expo/config-plugins').AndroidManifest} androidManifest
 * @returns {import('expo/config-plugins').AndroidManifest}
 */
function addSmsPermissions(androidManifest) {
  AndroidConfig.Permissions.ensurePermissions(androidManifest, SMS_PERMISSIONS);
  return androidManifest;
}

/**
 * Adds the Android SEND_SMS permission for the follow-up campaign feature.
 *
 * Android-only by construction — `withAndroidManifest` never runs on the iOS
 * prebuild, so the iOS binary declares nothing about SMS.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withSmsPermissions = (config) => {
  return withAndroidManifest(config, (config) => {
    config.modResults = addSmsPermissions(config.modResults);
    return config;
  });
};

module.exports = withSmsPermissions;
module.exports.withSmsPermissions = withSmsPermissions;
module.exports.addSmsPermissions = addSmsPermissions;
