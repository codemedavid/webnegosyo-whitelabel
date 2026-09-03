/**
 * Guardrail for the store-facing identity of the binary.
 *
 * The SmartMenu rename lives entirely in `app.config.ts` and `assets/`, and
 * neither is imported by any screen — nothing else in the suite would notice
 * if a merge, a prebuild, or a hand-edit put the old brand back. Worse, the
 * two identifiers next to the name (`bundleIdentifier`, `android.package`) are
 * the App Store app's and the Play listing's identity: changing either does
 * not rename the app, it starts a brand-new listing and abandons every
 * install, rating and review. That is unrecoverable, so it is asserted here
 * rather than trusted to review.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

import type { ConfigContext, ExpoConfig } from "expo/config";

import defineAppConfig from "../app.config";

const APP_ROOT = join(__dirname, "..");

/** The public name on both home screens. Store *listings* are console-side. */
const DISPLAY_NAME = "SmartMenu";

/** Identity, not branding. Never change these to match a rename. */
const IOS_BUNDLE_ID = "com.webnegosyo.admin";
const ANDROID_PACKAGE = "com.webnegosyo.admin";

/** PNG IHDR colour-type byte: 6 is RGBA, 2 is RGB, 4/0 greyscale ± alpha. */
const PNG_COLOUR_TYPE_OFFSET = 25;
const PNG_COLOUR_TYPES_WITH_ALPHA = [4, 6];

const resolveConfig = (): ExpoConfig =>
  defineAppConfig({ config: {} } as unknown as ConfigContext);

const readColourType = (relativePath: string): number =>
  readFileSync(join(APP_ROOT, relativePath))[PNG_COLOUR_TYPE_OFFSET];

describe("app branding", () => {
  it("names the app SmartMenu on both home screens", () => {
    expect(resolveConfig().name).toBe(DISPLAY_NAME);
  });

  it("keeps the original bundle id and package so the listings survive a rename", () => {
    const config = resolveConfig();

    expect(config.ios?.bundleIdentifier).toBe(IOS_BUNDLE_ID);
    expect(config.android?.package).toBe(ANDROID_PACKAGE);
  });

  it("ships no user-facing copy naming the app WebNegosyo", () => {
    const config = resolveConfig();
    const copy = [
      config.name,
      config.ios?.infoPlist?.NSCameraUsageDescription,
      config.ios?.infoPlist?.NSBluetoothAlwaysUsageDescription,
      config.ios?.infoPlist?.NSLocalNetworkUsageDescription,
      JSON.stringify(config.plugins),
    ].join(" ");

    expect(copy).not.toMatch(/WebNegosyo/i);
  });

  it("points every icon slot at a file that exists", () => {
    const config = resolveConfig();
    const assets = [
      config.icon,
      config.splash?.image,
      config.android?.adaptiveIcon?.foregroundImage,
    ];

    for (const asset of assets) {
      expect(typeof asset).toBe("string");
      expect(existsSync(join(APP_ROOT, asset as string))).toBe(true);
    }
  });

  it("ships an opaque App Store icon", () => {
    // App Store Connect rejects an icon carrying an alpha channel outright, at
    // upload time — after the build has already been paid for and queued.
    expect(PNG_COLOUR_TYPES_WITH_ALPHA).not.toContain(
      readColourType(resolveConfig().icon as string)
    );
  });
});
