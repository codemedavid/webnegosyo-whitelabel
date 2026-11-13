import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Identity ONLY. A tenant build differs from another in its store identity
 * (name, bundle id, package, icon, splash) and nothing else — theme, home
 * layout, banners, copy and features come from /api/app/v1/config at runtime.
 *
 * Do not read tenant identity from `Constants.expoConfig.extra` at runtime: an
 * OTA update replaces that manifest. The app resolves its tenant from the
 * native application id (see src/lib/api/tenant-identity.ts).
 *
 * Build-time env (set by the build pipeline from tenant_apps, see
 * scripts/customer-app-build/ci-lib.mjs `identityEnv`):
 *   APP_NAME, APP_BUNDLE_ID, APP_ANDROID_PACKAGE, APP_ICON, APP_ADAPTIVE_ICON,
 *   APP_ADAPTIVE_MONOCHROME, APP_ADAPTIVE_BACKGROUND, APP_NOTIFICATION_ICON,
 *   APP_SPLASH_IMAGE, APP_SPLASH_BACKGROUND
 *   EAS_PROJECT_ID  the one EAS project every store app is built in; without
 *                   it (Expo Go, local runs) the app can't get a push token
 *                   and has no over-the-air updates
 *
 * Over-the-air updates: ONE `production` channel for every store app, and the
 * runtime version is the app `version` (policy `appVersion`), NOT the native
 * fingerprint: a fingerprint hashes the resolved config, which differs per
 * store (name, ids, icons), so each store app would sit on its own runtime and
 * one update could never reach them all. So: bump `version` whenever native
 * code or a native module changes, or an update would reach binaries that
 * can't run it.
 */

const DEV_IDENTITY = {
  name: 'Kape Demo',
  bundleId: 'com.webnegosyo.customer.dev',
  androidPackage: 'com.webnegosyo.customer.dev',
  icon: './assets/icon.png',
  adaptiveIcon: './assets/android-icon-foreground.png',
  adaptiveMonochrome: './assets/android-icon-monochrome.png',
  adaptiveBackground: undefined as string | undefined,
  notificationIcon: undefined as string | undefined,
  splashImage: './assets/splash-icon.png',
  splashBackground: '#FFFFFF',
}

function readIdentity() {
  const env = process.env
  return {
    name: env.APP_NAME ?? DEV_IDENTITY.name,
    bundleId: env.APP_BUNDLE_ID ?? DEV_IDENTITY.bundleId,
    androidPackage: env.APP_ANDROID_PACKAGE ?? DEV_IDENTITY.androidPackage,
    icon: env.APP_ICON ?? DEV_IDENTITY.icon,
    adaptiveIcon: env.APP_ADAPTIVE_ICON ?? DEV_IDENTITY.adaptiveIcon,
    adaptiveMonochrome: env.APP_ADAPTIVE_MONOCHROME ?? DEV_IDENTITY.adaptiveMonochrome,
    adaptiveBackground: env.APP_ADAPTIVE_BACKGROUND ?? DEV_IDENTITY.adaptiveBackground,
    notificationIcon: env.APP_NOTIFICATION_ICON ?? DEV_IDENTITY.notificationIcon,
    splashImage: env.APP_SPLASH_IMAGE ?? DEV_IDENTITY.splashImage,
    splashBackground: env.APP_SPLASH_BACKGROUND ?? DEV_IDENTITY.splashBackground,
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const identity = readIdentity()
  const easProjectId = process.env.EAS_PROJECT_ID
  return {
    ...config,
    name: identity.name,
    // One EAS project serves every tenant; the slug never varies.
    slug: 'webnegosyo-customer',
    scheme: 'webnegosyo',
    version: '1.0.0',
    orientation: 'portrait',
    icon: identity.icon,
    userInterfaceStyle: 'light',
    ios: {
      bundleIdentifier: identity.bundleId,
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
    },
    android: {
      package: identity.androidPackage,
      adaptiveIcon: {
        foregroundImage: identity.adaptiveIcon,
        monochromeImage: identity.adaptiveMonochrome,
        // The icon's own corner colour, so the inset icon continues into it.
        backgroundColor: identity.adaptiveBackground ?? identity.splashBackground,
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-router',
      'expo-image',
      'expo-secure-store',
      'expo-web-browser',
      'expo-font',
      // Android draws the notification icon as a white mask; the pipeline makes one from the app icon.
      ['expo-notifications', { defaultChannel: 'orders', ...(identity.notificationIcon ? { icon: identity.notificationIcon, color: identity.splashBackground } : {}) }],
      [
        'expo-splash-screen',
        {
          image: identity.splashImage,
          backgroundColor: identity.splashBackground,
          imageWidth: 180,
        },
      ],
    ],
    runtimeVersion: { policy: 'appVersion' },
    ...(easProjectId ? { updates: { url: `https://u.expo.dev/${easProjectId}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 } } : {}),
    experiments: { typedRoutes: true },
    extra: {
      ...config.extra,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  }
}
