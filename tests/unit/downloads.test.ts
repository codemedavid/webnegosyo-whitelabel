import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mobileDownloads } from "@/lib/downloads";

/**
 * The merchant app's own version, read from its Expo config.
 *
 * Read as text rather than imported: `app.config.ts` is an Expo module that
 * pulls in `expo/config` types and reads build-time env vars, none of which
 * resolve under this app's Jest transform.
 */
function readMerchantAppVersion(): string {
  const config = readFileSync(
    join(process.cwd(), "webnegosyo-app", "app.config.ts"),
    "utf8",
  );
  const match = config.match(/^\s*version:\s*"([^"]+)"/m);

  if (!match) {
    throw new Error("Could not find `version` in webnegosyo-app/app.config.ts");
  }

  return match[1];
}

describe("mobileDownloads config", () => {
  test("every platform appears exactly once", () => {
    // Arrange
    const platforms = mobileDownloads.map((app) => app.platform);

    // Act
    const unique = new Set(platforms);

    // Assert
    expect(platforms).toHaveLength(unique.size);
    expect(unique).toEqual(new Set(["ios", "android"]));
  });

  test("an available app always has a link to send the user to", () => {
    // A card marked available renders a live button; a null href would render
    // an anchor to nowhere.
    const available = mobileDownloads.filter((app) => app.available);

    expect(available.length).toBeGreaterThan(0);
    for (const app of available) {
      expect(app.href).toBeTruthy();
      expect(app.href).toMatch(/^https:\/\//);
    }
  });

  test("an unavailable app has no link, so it renders as Coming soon", () => {
    const unavailable = mobileDownloads.filter((app) => !app.available);

    for (const app of unavailable) {
      expect(app.href).toBeNull();
    }
  });

  test("a direct APK download states its version and size", () => {
    // Unlike a storefront listing, a raw APK gives the user no other way to
    // see what they are about to install.
    const apks = mobileDownloads.filter((app) => app.kind === "apk");

    expect(apks.length).toBeGreaterThan(0);
    for (const app of apks) {
      expect(app.version).toBeTruthy();
      expect(app.size).toBeTruthy();
      expect(app.href).toMatch(/\.apk$/);
    }
  });

  test("the Android APK advertises the version the app is actually on", () => {
    // The APK version here is hand-maintained, so it silently drifts behind
    // the app every release: the page offered 1.0.2 while the app shipped
    // 1.0.4, telling merchants they were downloading a build that no longer
    // existed. Pin it to the Expo config so the drift fails the suite instead.
    const android = mobileDownloads.find((app) => app.platform === "android");

    expect(android?.version).toBe(readMerchantAppVersion());
  });

  test("the APK link outlives the build that produced it", () => {
    // EAS artifact URLs expire after ~30 days on the free tier and the button
    // then 404s silently — 1.0.5 shipped pointing at one. A GitHub Release
    // asset never expires, so that is what the page is allowed to link.
    const android = mobileDownloads.find((app) => app.platform === "android");

    expect(android?.href).toContain("github.com");
    expect(android?.href).toContain("/releases/download/");
    expect(android?.href).not.toContain("expo.dev/artifacts");
  });

  test("iOS ships through the App Store, not as a sideloaded file", () => {
    const ios = mobileDownloads.find((app) => app.platform === "ios");

    expect(ios?.kind).toBe("store");
    expect(ios?.href).toContain("apps.apple.com");
  });
});
