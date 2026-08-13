const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SMS_PERMISSIONS = ['android.permission.SEND_SMS'];

/**
 * @param {import('expo/config-plugins').AndroidManifest} androidManifest
 * @returns {import('expo/config-plugins').AndroidManifest}
 */
function addSmsPermissions(androidManifest) {
  AndroidConfig.Permissions.ensurePermissions(androidManifest, SMS_PERMISSIONS);
  return androidManifest;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withSmsPermissions = (config) => {
  return withAndroidManifest(config, (config) => {
    config.modResults = addSmsPermissions(config.modResults);
    return config;
  });
};

module.exports = withSmsPermissions;
module.exports.withSmsPermissions = withSmsPermissions;
module.exports.addSmsPermissions = addSmsPermissions;
