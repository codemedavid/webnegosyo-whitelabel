import { paperText } from "./paper-text";

describe("paperText", () => {
  it("prints an add-on amount with a plain x", () => {
    expect(paperText("     - Fried Rice ×2\n     + Kimchi ×3")).toBe("     - Fried Rice x2\n     + Kimchi x3");
  });

  it("leaves ordinary receipt text alone", () => {
    const text = "\x1b@ 2  Adobo        P130.00\n";
    expect(paperText(text)).toBe(text);
  });
});
