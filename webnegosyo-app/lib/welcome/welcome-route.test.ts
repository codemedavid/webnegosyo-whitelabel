/**
 * The welcome screen is the signed-out front door: the root layout sends every
 * signed-out launch there, and it lives in the auth stack beside login so
 * "Log in" can push login on top of it (Back returns to welcome).
 */
import { readFileSync } from "fs";
import { join } from "path";

const APP_DIR = join(__dirname, "..", "..", "app");
const read = (...parts: string[]) => readFileSync(join(APP_DIR, ...parts), "utf8");

describe("welcome route", () => {
  it("is where a signed-out launch lands", () => {
    expect(read("_layout.tsx")).toMatch(/router\.replace\("\/\(auth\)\/welcome"\)/);
  });

  it("is registered in the auth stack ahead of login", () => {
    const layout = read("(auth)", "_layout.tsx");
    expect(layout.indexOf('name="welcome"')).toBeGreaterThan(-1);
    expect(layout.indexOf('name="welcome"')).toBeLessThan(layout.indexOf('name="login"'));
  });
});
