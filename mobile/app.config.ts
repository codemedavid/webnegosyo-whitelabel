import { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => {
  const slug = process.env.EXPO_PUBLIC_TENANT_SLUG || 'walsikopi'
  // Sanitize name: remove dots/special chars that break Xcode target naming
  const rawName = process.env.TENANT_NAME || 'Walsikopi'
  const name = rawName.replace(/[^a-zA-Z0-9\s]/g, '').trim() || rawName
  const color = process.env.TENANT_PRIMARY_COLOR || '#111111'
  const sanitized = slug.replace(/-/g, '')

  return {
    ...config,
    name,
    slug: `webnegosyo-${slug}`,
    version: '1.0.0',
    orientation: 'portrait',
    icon: `./assets/generated/${slug}/icon.png`,
    scheme: `webnegosyo-${slug}`,
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: `./assets/generated/${slug}/splash.png`,
      resizeMode: 'contain',
      backgroundColor: color,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.webnegosyo.${sanitized}`,
      infoPlist: {
        LSApplicationQueriesSchemes: ['fb-messenger'],
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription:
          'Allow access to your photos so you can upload a screenshot of your payment as proof at checkout.',
      },
    },
    android: {
      package: `com.webnegosyo.${sanitized}`,
      adaptiveIcon: {
        foregroundImage: `./assets/generated/${slug}/adaptive-icon.png`,
        backgroundColor: color,
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: `./assets/generated/${slug}/favicon.png`,
    },
    plugins: ['expo-router'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: '20ee5e4b-5227-4adb-b9fe-6afe36a71aee',
      },
      tenantSlug: slug,
      tenantId: process.env.TENANT_ID || '',
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      googleScriptUrl: process.env.EXPO_PUBLIC_GOOGLE_SCRIPT_URL || '',
    },
  }
}
