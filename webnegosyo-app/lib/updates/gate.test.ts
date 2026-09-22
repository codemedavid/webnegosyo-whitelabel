import { decideUpdatePrompt, parseAppRelease, shouldCheckForUpdates, type AppRelease } from "./gate";

const release: AppRelease = {
  latestVersion: "1.0.9",
  minimumVersion: "1.0.5",
  storeUrl: "https://apps.apple.com/app/id6761642956",
  releaseNotes: "Faster printing.",
};

const noOta = { isAvailable: false, updateId: null };

function decide(overrides: Partial<Parameters<typeof decideUpdatePrompt>[0]> = {}) {
  return decideUpdatePrompt({
    currentVersion: "1.0.8",
    release,
    ota: noOta,
    dismissedSignature: null,
    ...overrides,
  });
}

describe("decideUpdatePrompt", () => {
  test("says nothing when the build is current and no update is waiting", () => {
    expect(decide({ currentVersion: "1.0.9" })).toEqual({ kind: "none" });
  });

  test("nudges to the store when a newer binary exists", () => {
    const prompt = decide();
    expect(prompt.kind).toBe("store");
    if (prompt.kind !== "store") throw new Error("expected a store prompt");
    expect(prompt.isBlocking).toBe(false);
    expect(prompt.version).toBe("1.0.9");
    expect(prompt.storeUrl).toBe(release.storeUrl);
  });

  test("blocks when the build is below the minimum the platform still supports", () => {
    const prompt = decide({ currentVersion: "1.0.4" });
    expect(prompt.kind).toBe("store");
    if (prompt.kind !== "store") throw new Error("expected a store prompt");
    expect(prompt.isBlocking).toBe(true);
  });

  // An OTA update only ever carries JS for the runtime the binary already
  // has, so it cannot lift a below-floor install. The block must win.
  test("a blocking floor outranks a waiting OTA update", () => {
    const prompt = decide({ currentVersion: "1.0.4", ota: { isAvailable: true, updateId: "abc" } });
    expect(prompt.kind).toBe("store");
  });

  test("prefers the one-tap OTA update over sending a current build to the store", () => {
    const prompt = decide({ currentVersion: "1.0.9", ota: { isAvailable: true, updateId: "abc" } });
    expect(prompt.kind).toBe("ota");
  });

  test("offers the OTA update ahead of a store nudge, since it needs no download", () => {
    const prompt = decide({ ota: { isAvailable: true, updateId: "abc" } });
    expect(prompt.kind).toBe("ota");
  });

  test("stays quiet about a nudge the merchant already dismissed", () => {
    const first = decide();
    expect(first.kind).toBe("store");
    if (first.kind === "none") throw new Error("expected a prompt");
    expect(decide({ dismissedSignature: first.signature })).toEqual({ kind: "none" });
  });

  test("a dismissal of one version does not silence the next one", () => {
    expect(decide({ dismissedSignature: "store:1.0.8" }).kind).toBe("store");
  });

  // Dismissal is a courtesy for nudges. A build below the floor is refused
  // service, so it must come back every time.
  test("a blocking prompt ignores an earlier dismissal", () => {
    const blocking = decide({ currentVersion: "1.0.4" });
    if (blocking.kind === "none") throw new Error("expected a prompt");
    expect(decide({ currentVersion: "1.0.4", dismissedSignature: blocking.signature }).kind).toBe("store");
  });

  test("says nothing when the platform has published no release row", () => {
    expect(decide({ release: null })).toEqual({ kind: "none" });
  });

  test("still offers an OTA update when no release row exists", () => {
    expect(decide({ release: null, ota: { isAvailable: true, updateId: "abc" } }).kind).toBe("ota");
  });

  test("never blocks when the running version cannot be read", () => {
    expect(decide({ currentVersion: null })).toEqual({ kind: "none" });
  });
});

describe("parseAppRelease", () => {
  test("maps a well-formed row", () => {
    const parsed = parseAppRelease({
      latest_version: "1.0.9",
      minimum_version: "1.0.5",
      store_url: "https://apps.apple.com/app/id6761642956",
      release_notes: "Faster printing.",
    });
    expect(parsed).toEqual(release);
  });

  test("accepts a row with no notes", () => {
    expect(
      parseAppRelease({
        latest_version: "1.0.9",
        minimum_version: "1.0.5",
        store_url: "https://play.google.com/store/apps/details?id=com.webnegosyo.admin",
        release_notes: null,
      })?.releaseNotes
    ).toBeNull();
  });

  // A malformed row must read as "no policy", never as "block everyone".
  test("rejects a row missing or mistyping any required field", () => {
    expect(parseAppRelease(null)).toBeNull();
    expect(parseAppRelease({ latest_version: "1.0.9" })).toBeNull();
    expect(
      parseAppRelease({ latest_version: 109, minimum_version: "1.0.5", store_url: "https://x.test" })
    ).toBeNull();
    expect(
      parseAppRelease({ latest_version: "1.0.9", minimum_version: "1.0.5", store_url: "" })
    ).toBeNull();
  });

  test("rejects a floor above the latest release, which would block everyone", () => {
    expect(
      parseAppRelease({
        latest_version: "1.0.5",
        minimum_version: "1.0.9",
        store_url: "https://apps.apple.com/app/id6761642956",
        release_notes: null,
      })
    ).toBeNull();
  });
});

describe("shouldCheckForUpdates", () => {
  test("checks a real signed-in session", () => {
    expect(shouldCheckForUpdates({ isAuthenticated: true, isDemo: false })).toBe(true);
  });

  test("never checks before sign-in", () => {
    expect(shouldCheckForUpdates({ isAuthenticated: false, isDemo: false })).toBe(false);
  });

  // App Review drives the demo account; a floor it cannot clear reads as a
  // broken app and gets the release rejected.
  test("never checks the demo account", () => {
    expect(shouldCheckForUpdates({ isAuthenticated: true, isDemo: true })).toBe(false);
  });
});
