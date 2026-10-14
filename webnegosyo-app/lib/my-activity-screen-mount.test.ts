// Guardrails for "Your activity" (Store activity, own rows only). Like the
// other mount guardrails this reads sources: the screen is a routable utility
// screen, never a tab (staff tab bars must not change), it gates itself on
// canOpenMyActivity, always narrows to the caller, and has its two doors.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "my-activity.tsx");

describe("Your activity screen mounting", () => {
  it("is registered in the (main) layout as a utility screen, never a tab", () => {
    const layout = read("app", "(main)", "_layout.tsx");
    const registration = layout.match(/name="my-activity"[\s\S]{0,120}/)?.[0] ?? "";
    expect(registration).toMatch(/href:\s*null/);
  });

  it("is drawn with BackHeader as Your activity", () => {
    expect(screen()).toMatch(/import \{ BackHeader \} from "\.\.\/\.\.\/components\/BackHeader";/);
    expect(screen()).toMatch(/<BackHeader[\s\S]{0,80}title="Your activity"/);
  });

  it("has a door on the Account screen and on the Drawer (POS sales), each gated", () => {
    for (const door of [read("app", "(main)", "account.tsx"), read("app", "(main)", "pos-sales.tsx")]) {
      expect(door).toMatch(/canOpenMyActivity/);
      expect(door).toMatch(/MY_ACTIVITY_HREF/);
    }
    expect(read("app", "(main)", "pos-sales.tsx")).toMatch(/Your activity today/);
  });
});

describe("Your activity screen gates", () => {
  it("refuses a session canOpenMyActivity rejects", () => {
    expect(screen()).toMatch(/canOpenMyActivity/);
  });

  it("always narrows the read to the signed-in person", () => {
    expect(screen()).toMatch(/myActivityFilters\(userId/);
  });
});
