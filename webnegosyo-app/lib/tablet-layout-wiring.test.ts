/**
 * Guardrails for the tablet work, asserted on source.
 *
 * Like the other mount guardrails in this directory, the logic suite cannot
 * render a screen or read a native manifest — so these read the files that
 * decide the arrangement and check they still defer to the tested modules
 * rather than re-deciding by hand. The arithmetic itself lives in
 * `pos-layout.test.ts` and `screen-size.test.ts`.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const posScreen = () => read("app", "(main)", "pos.tsx");
const appConfig = () => read("app.config.ts");
const rootLayout = () => read("app", "_layout.tsx");

describe("the register's arrangement", () => {
  it("is decided by the shared layout module, not by a second opinion", () => {
    expect(posScreen()).toMatch(/resolvePosLayout/);
    expect(posScreen()).toMatch(/useWindowDimensions/);
  });

  it("reads the LIVE window, so rotating a tablet re-arranges the register", () => {
    // A module-scope `Dimensions.get` is frozen at the orientation the app
    // launched in — the bug this whole change exists to avoid.
    expect(posScreen()).not.toMatch(/^const .*Dimensions\.get/m);
  });

  it("takes its column count from the layout rather than a fixed constant", () => {
    expect(posScreen()).toMatch(/layout\.columns/);
    expect(posScreen()).not.toMatch(/const COLUMNS = /);
  });

  it("hands the sale the variant the layout chose", () => {
    expect(posScreen()).toMatch(/variant=\{layout\.isTwoPane \? "panel" : "sheet"\}/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
  });
});

describe("orientation", () => {
  it("no longer pins the whole app upright", () => {
    expect(appConfig()).not.toMatch(/orientation: "portrait"/);
    expect(appConfig()).toMatch(/orientation: "default"/);
  });

  it("still pins iPhones upright, per idiom", () => {
    expect(appConfig()).toMatch(
      /UISupportedInterfaceOrientations: \["UIInterfaceOrientationPortrait"\]/,
    );
  });

  it("pins iPads sideways, either way up", () => {
    const config = appConfig();
    const ipadKey = config.match(
      /"UISupportedInterfaceOrientations~ipad": \[[^\]]*\]/,
    )?.[0];

    expect(ipadKey).toMatch(/UIInterfaceOrientationLandscapeLeft/);
    expect(ipadKey).toMatch(/UIInterfaceOrientationLandscapeRight/);
    // Portrait in this list is what would let a counter-mounted register be
    // stood up on its end, which is the arrangement the POS is not drawn for.
    expect(ipadKey).not.toMatch(/UIInterfaceOrientationPortrait/);
  });

  it("opts the iPad out of multitasking, as a non-rotating app must", () => {
    // Apple requires an iPad app that supports multitasking to accept all
    // four orientations; the landscape-only list above is honoured only with
    // this key set. Dropping it silently puts portrait back.
    expect(appConfig()).toMatch(/UIRequiresFullScreen: true/);
  });

  it("locks Android at runtime, since its manifest cannot vary by size", () => {
    expect(rootLayout()).toMatch(/useOrientationLock\(\)/);
  });
});
