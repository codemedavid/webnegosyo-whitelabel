/**
 * Central config for the public download page (`/download`).
 *
 * Desktop binaries are served from `public/downloads/`. To ship a new build,
 * drop the artifact in `public/downloads/` and bump the entry below.
 *
 * Mobile apps are configured here too; flip `available` to true and fill in the
 * store URLs once the App Store / Play Store listings are live.
 */

export const DESKTOP_VERSION = "0.1.0";

export interface DesktopDownload {
  os: "macos" | "windows";
  label: string;
  /** e.g. "Apple Silicon", "Windows 10/11" */
  requirement: string;
  /** Public path under /public */
  href: string;
  /** Human-readable file size */
  size: string;
  /** File extension shown on the button, e.g. ".dmg" */
  ext: string;
}

export const desktopDownloads: DesktopDownload[] = [
  {
    os: "macos",
    label: "macOS",
    requirement: "Apple Silicon (M1 or newer)",
    href: "/downloads/WebNegosyo-POS-0.1.0-arm64.dmg",
    size: "113 MB",
    ext: ".dmg",
  },
  {
    os: "windows",
    label: "Windows",
    requirement: "Windows 10 & 11 (64-bit)",
    href: "/downloads/WebNegosyo-POS-Setup-0.1.0.exe",
    size: "91 MB",
    ext: ".exe",
  },
];

export interface MobileDownload {
  platform: "ios" | "android";
  label: string;
  /** Source of the build — a storefront name, or "Direct download" for a raw APK. */
  store: string;
  /** A storefront listing links out; an APK downloads a file the user must sideload. */
  kind: "store" | "apk";
  href: string | null;
  available: boolean;
  /** Shown for `kind: "apk"` only — a store listing surfaces its own version. */
  version?: string;
  size?: string;
}

/**
 * Android is not on Google Play yet, so it ships as a sideloaded APK.
 *
 * The APK is hosted off-repo: at ~111 MB it exceeds GitHub's 100 MB *file*
 * limit, so it cannot be committed to `public/downloads/`.
 *
 * `href` currently points at the EAS build artifact for the 1.0.5 APK build
 * (`production-apk`, versionCode 30). Note the trade-off: EAS artifact URLs
 * expire after ~30 days on the free tier, and when one lapses the button 404s
 * silently. Mirroring the same file to a GitHub Release asset (as 1.0.4 did)
 * gives a link that outlives the build — do that if this page must survive
 * unattended past the artifact's expiry.
 *
 * Re-point `href` on every Android release. The version below is pinned to
 * `webnegosyo-app/app.config.ts` by `tests/unit/downloads.test.ts`, so letting
 * it drift behind the app fails the suite instead of misleading merchants.
 */
export const mobileDownloads: MobileDownload[] = [
  {
    platform: "ios",
    label: "WebNegosyo for iPhone & iPad",
    store: "App Store",
    kind: "store",
    href: "https://apps.apple.com/ph/app/webnegosyo/id6761642956",
    available: true,
  },
  {
    platform: "android",
    label: "WebNegosyo for Android",
    store: "Direct download",
    kind: "apk",
    href: "https://expo.dev/artifacts/eas/Z1JMu6G4EkX03DkpIZ1HnVFuOB95zgBMqZDu_UmQFfo.apk",
    available: true,
    version: "1.0.5",
    size: "111 MB",
  },
];
