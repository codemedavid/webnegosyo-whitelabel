import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Home-screen name on both platforms. The store *listing* names are set in
  // App Store Connect and Play Console, not here — keep all three in sync.
  // `slug`, `scheme`, `bundleIdentifier` and `android.package` deliberately keep
  // the webnegosyo identifiers: changing the bundle id starts a brand-new App
  // Store app and changing the Android package starts a brand-new Play listing,
  // losing every existing install and review. A rename is display-only.
  name: "SmartMenu",
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
  // closed train.
  //
  // 1.0.3 (build 36) then went READY_FOR_SALE on 2026-08-04, closing that
  // train too. Verified against App Store Connect before bumping — check
  // GET /v1/apps/6761642956/appStoreVersions rather than assuming, because a
  // train is closed by APPROVAL, not by how recently you built. Hence 1.0.4 —
  // bump this again after the next approval.
  version: "1.0.4",
  orientation: "portrait",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    // White, to match the SmartMenu mark's own background — the old #F2F2F7
    // left a visible square edge around the logo plate.
    backgroundColor: "#FFFFFF",
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
      // The SmartMenu mark is red/orange on white; the old #111111 plate put a
      // black ring around it under every Android mask shape.
      backgroundColor: "#FFFFFF",
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
        photosPermission: "Allow SmartMenu to access your photos to add product images.",
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
