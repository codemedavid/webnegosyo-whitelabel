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
  //
  // 1.0.4 (builds 37-39) went READY_FOR_SALE on 2026-08-28, closing that train
  // in turn. Re-verified against /v1/apps/6761642956/appStoreVersions on
  // 2026-09-04 before bumping. Hence 1.0.5.
  //
  // 1.0.5 (build 40) went READY_FOR_SALE, closing that train. Re-verified
  // against /v1/apps/6761642956/appStoreVersions on 2026-09-09 before bumping.
  // Hence 1.0.6 (carries the native iOS thermal-printer raster patch).
  //
  // 1.0.6 (build 41) was still WAITING_FOR_REVIEW on 2026-09-10 when the
  // Modern receipt theme + per-printer paper width shipped; a new binary under
  // a version that may be approved any minute would strand it, so 1.0.7.
  //
  // 1.0.6 went READY_FOR_SALE on its own, closing that train. Builds 42-44
  // were uploaded under 1.0.7 but no 1.0.7 App Store version record was ever
  // created, so they sit unreleased in TestFlight. Re-verified against
  // /v1/apps/6761642956/appStoreVersions on 2026-09-20 before bumping. Hence
  // 1.0.8 — a clean train for this release, distinct from those three stale
  // 1.0.7 binaries.
  version: "1.0.8",
  // "default" hands the decision to the OS, which is the only way one binary
  // can hold a phone upright and lay a tablet down. Nothing is actually left
  // free by this: iPhones are pinned portrait and iPads landscape by the
  // per-idiom Info.plist keys below, and every Android device by the runtime
  // lock in app/_layout.tsx, which sizes the decision off the window
  // (lib/screen-size.ts). Setting "portrait" here is what merchants reported
  // as the app "only working portrait" on a counter stand.
  orientation: "default",
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
      // iOS reads orientation PER IDIOM: the plain key governs iPhone, the
      // "~ipad" key governs iPad. Spelling both out is what lets one binary
      // keep every handset upright while laying every tablet down — the
      // top-level `orientation: "default"` alone would unlock both.
      UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
      // Landscape ONLY, both ways up: an iPad is a counter terminal and the
      // register is drawn two-pane for that shape (lib/pos-layout.ts). Adding
      // either portrait value back lets a stand be stood on its end mid-sale.
      "UISupportedInterfaceOrientations~ipad": [
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
      ],
      // The price of the line above. Apple requires an iPad app that supports
      // multitasking to accept all four orientations, so without this key the
      // landscape-only list is ignored and portrait comes back. Opting out
      // costs Split View and Slide Over, which a full-screen register in a
      // stand never used.
      UIRequiresFullScreen: true,
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
    // Handset half of the loyalty OTP delivery pilot gate; the web routes are
    // gated separately. Off unless a build sets it to exactly "true".
    loyaltyPosEnabled: process.env.EXPO_PUBLIC_LOYALTY_POS_SETTLEMENT_ENABLED === "true",
    loyaltySmsDeliveryEnabled: process.env.EXPO_PUBLIC_LOYALTY_SMS_DELIVERY_ENABLED === "true",
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
