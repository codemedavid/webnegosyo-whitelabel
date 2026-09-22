import { readFileSync } from "node:fs";
import { join } from "node:path";
import { desktopDownloads, mobileDownloads } from "@/lib/downloads";

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

describe("desktopDownloads config", () => {
  test("every OS appears exactly once", () => {
    // Arrange
    const targets = desktopDownloads.map((build) => build.os);

    // Act
    const unique = new Set(targets);

    // Assert
    expect(targets).toHaveLength(unique.size);
    expect(unique).toEqual(new Set(["macos", "windows"]));
  });

  test("an offered build is never served from public/downloads", () => {
    // `.gitignore` excludes `public/downloads/*.dmg` because the installer is
    // over GitHub's 100 MB file limit, so the binary never reached the
    // deployment and both POS buttons 404'd for every merchant who clicked
    // one. Nothing under `/downloads/` may be offered again.
    for (const build of desktopDownloads) {
      expect(build.href ?? "").not.toMatch(/^\/downloads\//);
    }
  });

  test("an offered build links to a GitHub Release asset that outlives it", () => {
    // Same rule the APK lives by: a Release asset is exempt from the file
    // limit and never expires, so the link cannot rot unattended.
    const offered = desktopDownloads.filter((build) => build.available);

    for (const build of offered) {
      expect(build.href).toMatch(/^https:\/\//);
      expect(build.href).toContain("github.com");
      expect(build.href).toContain("/releases/download/");
    }
  });

  test("an unhosted build has no link, so it renders as Coming soon", () => {
    // A card with a dead href is worse than no card: it looks like a working
    // download right up until the 404.
    const unhosted = desktopDownloads.filter((build) => !build.available);

    for (const build of unhosted) {
      expect(build.href).toBeNull();
    }
  });

  test("every build states the version, size and extension it ships", () => {
    // A desktop installer gives the user no storefront page to check against.
    for (const build of desktopDownloads) {
      expect(build.label).toBeTruthy();
      expect(build.requirement).toBeTruthy();
      expect(build.ext).toMatch(/^\./);
      if (build.available) expect(build.size).toBeTruthy();
    }
  });
});
