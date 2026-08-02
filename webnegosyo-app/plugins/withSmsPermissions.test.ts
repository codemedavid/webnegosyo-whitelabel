import type { AndroidManifest, ExportedConfig, ExportedConfigWithProps } from "expo/config-plugins";
import { addSmsPermissions, withSmsPermissions } from "./withSmsPermissions";

const SEND_SMS = "android.permission.SEND_SMS";

function makeManifest(existingPermissions: string[] = []): AndroidManifest {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      application: [{ $: {} }],
      "uses-permission": existingPermissions.map((name) => ({ $: { "android:name": name } })),
    },
  } as unknown as AndroidManifest;
}

function permissionNames(manifest: AndroidManifest): string[] {
  return (manifest.manifest["uses-permission"] ?? []).map((entry) => entry.$["android:name"]);
}

describe("addSmsPermissions", () => {
  it("adds SEND_SMS when it is not already present", () => {
    const result = addSmsPermissions(makeManifest());

    expect(permissionNames(result)).toContain(SEND_SMS);
  });

  it("does not duplicate SEND_SMS when it is already present", () => {
    const result = addSmsPermissions(makeManifest([SEND_SMS]));

    expect(permissionNames(result).filter((name) => name === SEND_SMS)).toHaveLength(1);
  });

  it("leaves unrelated permissions in place", () => {
    const result = addSmsPermissions(makeManifest(["android.permission.CAMERA"]));

    expect(permissionNames(result)).toContain("android.permission.CAMERA");
  });

  it("never requests inbox-reading permissions", () => {
    const result = addSmsPermissions(makeManifest());

    expect(permissionNames(result)).not.toContain("android.permission.READ_SMS");
    expect(permissionNames(result)).not.toContain("android.permission.RECEIVE_SMS");
  });
});

describe("withSmsPermissions", () => {
  it("registers an Android manifest mod", () => {
    const config = withSmsPermissions({ name: "t", slug: "t" }) as ExportedConfig;

    expect(typeof config.mods?.android?.manifest).toBe("function");
  });

  it("adds SEND_SMS when the registered mod runs", async () => {
    const config = withSmsPermissions({ name: "t", slug: "t" }) as ExportedConfig;
    const modConfig = {
      ...config,
      modResults: makeManifest(),
    } as ExportedConfigWithProps<AndroidManifest>;

    const result = await config.mods?.android?.manifest?.(modConfig);

    expect(permissionNames(result!.modResults)).toContain(SEND_SMS);
  });
});
