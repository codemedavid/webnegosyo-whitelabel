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
 * Build-time env (set by the build pipeline from tenant_apps):
 *   APP_NAME, APP_BUNDLE_ID, APP_ANDROID_PACKAGE, APP_ICON, APP_ADAPTIVE_ICON,
 *   APP_SPLASH_IMAGE, APP_SPLASH_BACKGROUND
 */

const DEV_IDENTITY = {
  name: 'Kape Demo',
  bundleId: 'com.webnegosyo.customer.dev',
  androidPackage: 'com.webnegosyo.customer.dev',
  icon: './assets/icon.png',
  adaptiveIcon: './assets/android-icon-foreground.png',
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
    splashImage: env.APP_SPLASH_IMAGE ?? DEV_IDENTITY.splashImage,
    splashBackground: env.APP_SPLASH_BACKGROUND ?? DEV_IDENTITY.splashBackground,
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const identity = readIdentity()
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
        backgroundColor: identity.splashBackground,
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-router',
      'expo-image',
      'expo-secure-store',
      'expo-web-browser',
      'expo-font',
      [
        'expo-splash-screen',
        {
          image: identity.splashImage,
          backgroundColor: identity.splashBackground,
          imageWidth: 180,
        },
      ],
    ],
    experiments: { typedRoutes: true },
  }
}
