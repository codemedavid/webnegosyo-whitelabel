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
 * `href` points at a **GitHub Release asset**, not an EAS artifact URL. EAS
 * artifacts expire after ~30 days on the free tier and the button then 404s
 * silently, with nothing on the page to say so — 1.0.5 shipped that way and
 * was three weeks from breaking unattended. Release assets never expire and
 * are exempt from the 100 MB file limit on a public repo, which is why 1.0.4
 * used one and why every release since 1.0.7 does.
 *
 * To ship an Android release: build `production-apk`, download the artifact,
 * then `gh release create merchant-app-v<version> <file> --target main` and
 * point `href` at the asset's download URL. The version below is pinned to
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
    href: "https://github.com/codemedavid/webnegosyo-whitelabel/releases/download/merchant-app-v1.0.7/WebNegosyo-1.0.7-build34.apk",
    available: true,
    version: "1.0.7",
    size: "111 MB",
  },
];
