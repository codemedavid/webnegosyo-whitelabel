import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "WebNegosyo",
  slug: "webnegosyo-app",
  owner: "itscodemedavid",
  scheme: "webnegosyo-admin",
  // Apple closes a version "train" once it has been approved: 1.0.0 was
  // approved, then 1.0.1 was approved on top of it, so App Store Connect
  // rejects every further build under either ("Invalid Pre-Release Train …
  // closed for new build submissions"), no matter how high the build number
  // goes. Shipping anything to iOS requires this to move on every release that
  // follows an approval. Note `runtimeVersion.policy` is "appVersion", so
  // bumping it also starts a new OTA update lane — 1.0.2 installs will not
  // receive 1.0.3 updates, which is the intended behaviour for a new binary.
  //
  // 1.0.2 was approved and released on 2026-08-01, which closed its train in
  // turn: builds 28-35 all compiled fine and then failed at submission, since
  // the binary is what carries the version and no build number can reopen a
  // closed train. Hence 1.0.3 — bump this again after the next approval.
  version: "1.0.3",
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
    // Left empty rather than defaulted, so `lib/web-app-url.ts` owns the
    // canonical host in one place. Defaulting here would shadow it and put the
    // redirecting apex domain back in front of every server call.
    webAppUrl: process.env.EXPO_PUBLIC_WEB_APP_URL ?? "",
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
    // Android-only: adds SEND_SMS for the follow-up campaign feature. The mod
    // is a withAndroidManifest mod, so the iOS prebuild is untouched.
    "./plugins/withSmsPermissions.js",
    // Calendar and clock pickers for the campaign schedule. A native module, so
    // it only reaches the merchant through a new build — not an OTA update.
    "@react-native-community/datetimepicker",
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
