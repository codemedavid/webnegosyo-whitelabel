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
 * The APK is served straight from its EAS build artifact rather than from
 * `public/downloads/`: at 107 MB it exceeds GitHub's 100 MB file limit, so it
 * cannot be committed. Note the tradeoff — EAS build artifacts expire (30 days
 * on the free tier), and when this URL dies the button 404s silently, exactly
 * as `public/downloads/*.dmg` does today after being gitignored for size.
 * Re-point `href` at the new artifact on every Android release, or move both
 * binaries to durable hosting (GitHub Release asset / object storage).
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
    href: "https://expo.dev/artifacts/eas/aQ-igs_PAByk5K4yQfnLUnBK5dxcZlYKRWgBKB_YdFo.apk",
    available: true,
    version: "1.0.2",
    size: "107 MB",
  },
];
