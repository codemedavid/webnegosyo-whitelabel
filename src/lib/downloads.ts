/**
 * Central config for the public download page (`/download`).
 *
 * Every binary this page offers is hosted as a **GitHub Release asset**, for
 * both desktop and mobile. Nothing is served out of `public/downloads/`:
 * `.gitignore` excludes the installers there because they exceed GitHub's
 * 100 MB *file* limit, so they never reach the deployment and the buttons
 * pointing at them 404 for every visitor who clicks one. Release assets are
 * exempt from that limit and never expire, which is why the Android APK
 * moved to one and why the desktop builds do too.
 *
 * A build with no hosted asset is `available: false` with a null `href`: the
 * card renders as "Coming soon" instead of a button to a 404.
 */

export const DESKTOP_VERSION = "0.1.0";

export interface DesktopDownload {
  os: "macos" | "windows";
  label: string;
  /** e.g. "Apple Silicon", "Windows 10/11" */
  requirement: string;
  /** A permanent GitHub Release asset URL, or null while unhosted. */
  href: string | null;
  /** A hosted build renders a live button; an unhosted one renders Coming soon. */
  available: boolean;
  /** Human-readable file size. Only meaningful for a hosted build. */
  size?: string;
  /** File extension shown on the card, e.g. ".dmg" */
  ext: string;
}

/**
 * To publish a desktop build, upload the installer to a Release and point
 * `href` at the asset, then flip `available` to true:
 *
 *   gh release create pos-desktop-v0.1.0 \
 *     "webnegosyo-desktop/release/WebNegosyo POS-0.1.0-arm64.dmg#WebNegosyo-POS-0.1.0-arm64.dmg" \
 *     --repo codemedavid/webnegosyo-whitelabel --target main \
 *     --title "WebNegosyo POS 0.1.0"
 *
 * macOS asset URL once uploaded:
 * https://github.com/codemedavid/webnegosyo-whitelabel/releases/download/pos-desktop-v0.1.0/WebNegosyo-POS-0.1.0-arm64.dmg
 */
export const desktopDownloads: DesktopDownload[] = [
  {
    os: "macos",
    label: "macOS",
    requirement: "Apple Silicon (M1 or newer)",
    href: null,
    available: false,
    ext: ".dmg",
  },
  {
    // The 0.1.0 installer was built once and no longer exists anywhere — only
    // its `.blockmap` survives in `webnegosyo-desktop/release/`. Rebuild it
    // before this can be offered again.
    os: "windows",
    label: "Windows",
    requirement: "Windows 10 & 11 (64-bit)",
    href: null,
    available: false,
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
 * The APK is hosted off-repo: at ~112 MB it exceeds GitHub's 100 MB *file*
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
    href: "https://github.com/codemedavid/webnegosyo-whitelabel/releases/download/merchant-app-v1.0.9/WebNegosyo-1.0.9-build40.apk",
    available: true,
    version: "1.0.9",
    size: "112 MB",
  },
];
