/**
 * Reproducer for the release crash:
 *   ERROR [Error: Cannot find native module 'ExpoSharing']
 *   at <global> lib/export/share.ts:15 → run-export.ts → app/(main)/customers.tsx
 *
 * The installed binary predates the export feature, so BOTH export natives
 * (ExpoFileSystem and ExpoSharing) are absent. Their JS entry points throw
 * at require time — modelled here with throwing mock factories. Importing
 * `./share` must therefore never load them eagerly, and pressing an export
 * button must fail with a merchant-readable message, not a red screen.
 */

jest.mock("expo-file-system/legacy", () => {
  throw new Error("Cannot find native module 'ExpoFileSystem'");
});

jest.mock("expo-sharing", () => {
  throw new Error("Cannot find native module 'ExpoSharing'");
});

describe("share module when the export native modules are missing from the binary", () => {
  it("can be imported without throwing (screen must not crash at mount)", () => {
    expect(() => require("./share")).not.toThrow();
  });

  it("can be imported transitively via run-export without throwing", () => {
    expect(() => require("./run-export")).not.toThrow();
  });

  it("rejects shareCsv with a merchant-readable update message", async () => {
    const { shareCsv } = require("./share") as typeof import("./share");

    await expect(
      shareCsv({ fileName: "customers_2026-08-19.csv", csv: "﻿a,b" })
    ).rejects.toThrow(/update the app/i);
  });
});
