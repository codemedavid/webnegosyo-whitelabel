import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { SIGN_OUT_SCOPE, signOutThisDevice } from "./sign-out";

/**
 * A global sign-out revokes every session the user holds, including the MCP
 * connector's OAuth session. With one shared account, one "Sign Out" tap
 * logged out the whole team. These tests lock the narrower scope in, and stop
 * a bare `auth.signOut()` from creeping back anywhere in the app.
 */

const APP_ROOT = join(__dirname, "..");
const HELPER_PATH = join(__dirname, "sign-out.ts");
const SCANNED_DIRS = ["app", "components", "hooks", "lib", "stores"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("signOutThisDevice", () => {
  test("signs out with the local scope only", async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });

    await signOutThisDevice({ auth: { signOut } });

    expect(SIGN_OUT_SCOPE).toBe("local");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("no app source file calls auth.signOut directly outside the helper", () => {
    const offenders = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(APP_ROOT, dir)))
      .filter((file) => file !== HELPER_PATH)
      .filter((file) => /\.auth\.signOut\(/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
