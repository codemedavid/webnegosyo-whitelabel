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
  store: string;
  href: string | null;
  available: boolean;
}

export const mobileDownloads: MobileDownload[] = [
  {
    platform: "ios",
    label: "WebNegosyo for iPhone & iPad",
    store: "App Store",
    href: null,
    available: false,
  },
  {
    platform: "android",
    label: "WebNegosyo for Android",
    store: "Google Play",
    href: null,
    available: false,
  },
];
