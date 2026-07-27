import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "WebNegosyo",
  slug: "webnegosyo-app",
  owner: "itscodemedavid",
  scheme: "webnegosyo-admin",
  // Apple closes a version "train" once it has been approved: 1.0.0 was
  // approved, so App Store Connect rejects every further build under it
  // ("Invalid Pre-Release Train … closed for new build submissions"), no matter
  // how high the build number goes. Shipping anything to iOS requires this to
  // move. Note `runtimeVersion.policy` is "appVersion", so bumping it also
  // starts a new OTA update lane — 1.0.0 installs will not receive 1.0.1
  // updates, which is the intended behaviour for a new binary release.
  version: "1.0.1",
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
      NSCameraUsageDescription: "Scan customer order QR codes",
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
    webAppUrl: process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://webnegosyo.com",
    consultationUrl:
      process.env.EXPO_PUBLIC_CONSULTATION_MESSENGER_URL ??
      "https://m.me/webnegosyoofficial",
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
    [
      "expo-camera",
      {
        cameraPermission: "Scan customer order QR codes",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow WebNegosyo to access your photos to add product images.",
      },
    ],
    "./plugins/withThermalPrinterSimulatorFix.js",
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
