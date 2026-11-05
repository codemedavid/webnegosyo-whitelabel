// Guardrails for My shifts (reads the screen source, like the other *-mount
// tests): VoiceOver reaches each card's View and Reprint buttons, and the
// line after a reprint is the plain "Printed." — reset on every visit.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const screen = () => readFileSync(join(ROOT, "app", "(main)", "my-shifts.tsx"), "utf8");

describe("My shifts screen", () => {
  it("does not fold the card into one accessible element (that hid View / Reprint from VoiceOver)", () => {
    const src = screen();
    const card = src.slice(src.indexOf("function ShiftRowCard"));
    const outer = card.slice(card.indexOf("<View style={styles.card}"), card.indexOf(">", card.indexOf("<View style={styles.card}")));
    expect(outer).not.toMatch(/\baccessible\b/);
    expect(card).toMatch(/accessibilityLabel=\{`\$\{row\.day\}, \$\{row\.times\}, \$\{row\.net\}/);
  });

  it("says Printed. after a reprint, and clears it when she comes back", () => {
    const src = screen();
    expect(src).toMatch(/printStateText\(printer\.state, REPRINTED_TEXT\)/);
    expect(src).toMatch(/useFocusEffect\(/);
    expect(src).toMatch(/resetPrint\(\)/);
  });
});
