// Guardrails for the cashier's "Kitchen confirmed" banner. Jest's logic suite
// cannot render the tab layout, so this pins the wiring in source, like the
// other *-mount tests here.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");

describe("kitchen confirm banner wiring", () => {
  const layout = () => read("app", "(main)", "_layout.tsx");
  const host = () => read("components", "GlobalKitchenConfirmAlerts.tsx");

  it("is mounted app-wide, only for accounts the database hands orders to", () => {
    expect(layout()).toMatch(/canSeeOrders && <GlobalKitchenConfirmAlerts \/>/);
  });

  it("is mounted after the tab navigator, so the banner draws over every screen", () => {
    const source = layout();
    expect(source.indexOf("<GlobalKitchenConfirmAlerts")).toBeGreaterThan(source.indexOf("</Tabs>"));
  });

  it("reads the same shared live queue as the ringtone — no extra backend reads", () => {
    expect(host()).toMatch(/orders:getRealtimeQueue/);
    expect(host()).toMatch(/filterOrdersToScope/);
  });

  it("decides who hears it and what counts through the shared rules", () => {
    const source = host();
    expect(source).toMatch(/shouldShowKitchenConfirmations\(/);
    expect(source).toMatch(/detectKitchenConfirmations\(/);
    expect(source).toMatch(/confirmedOnThisDevice\(\)/);
  });

  it("never blocks the register with a dialog", () => {
    expect(host()).not.toMatch(/Alert\.alert/);
  });

  it("ships its chime with the bundle (OTA-able, no native change)", () => {
    expect(existsSync(join(ROOT, "assets", "kitchen-confirmed.wav"))).toBe(true);
  });
});
