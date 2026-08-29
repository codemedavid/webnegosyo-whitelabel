import { mobileDownloads } from "@/lib/downloads";

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

  test("iOS ships through the App Store, not as a sideloaded file", () => {
    const ios = mobileDownloads.find((app) => app.platform === "ios");

    expect(ios?.kind).toBe("store");
    expect(ios?.href).toContain("apps.apple.com");
  });
});
