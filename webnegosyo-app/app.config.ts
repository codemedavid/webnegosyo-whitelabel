import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "WebNegosyo",
  slug: "webnegosyo-app",
  owner: "itscodemedavid",
  scheme: "webnegosyo-admin",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#F2F2F7",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.webnegosyo.admin",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSBluetoothAlwaysUsageDescription:
        "This app uses Bluetooth to connect to thermal receipt printers for printing customer orders.",
      NSBluetoothPeripheralUsageDescription:
        "This app uses Bluetooth to connect to thermal receipt printers for printing customer orders.",
      NSLocalNetworkUsageDescription:
        "This app uses your local network to connect to network thermal receipt printers for printing customer orders.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundColor: "#111111",
    },
    package: "com.webnegosyo.admin",
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    eas: {
      projectId: "e4af765d-36fe-4248-990d-e0589d1a6c50",
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        sounds: ["./assets/ringtone.mp3"],
      },
    ],
    "expo-audio",
  ],
  updates: {
    url: "https://u.expo.dev/e4af765d-36fe-4248-990d-e0589d1a6c50",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  experiments: {
    typedRoutes: true,
  },
});
