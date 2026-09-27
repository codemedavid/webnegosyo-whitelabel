import * as fs from "fs";
import * as path from "path";
import {
  BLOCK_PALETTE,
  describeBlockStyle,
  sanitizeLayoutForSave,
  seedBlock,
  setBlockStyle,
} from "./receipt-editor";
import { parseReceiptLayout, type ReceiptBlockKind } from "./receipt-layout";

describe("the block palette", () => {
  it("offers every kind exactly once", () => {
    const kinds = BLOCK_PALETTE.map((entry) => entry.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("seeds only blocks the printer accepts", () => {
    for (const { kind } of BLOCK_PALETTE) {
      expect(parseReceiptLayout({ version: 1, blocks: [seedBlock(kind)] })).not.toBeNull();
    }
  });

  // The phone and the web must offer the same blocks: a merchant who adds one
  // on the web and opens the phone editor must find it in the library.
  it("matches the web Studio's palette kind for kind", () => {
    const web = fs.readFileSync(path.join(__dirname, "../../src/lib/receipt-editor.ts"), "utf8");
    const webKinds = [...web.matchAll(/\{ kind: '(\w+)', label: '[^']*', description:/g)].map((m) => m[1] as ReceiptBlockKind);
    expect(BLOCK_PALETTE.map((entry) => entry.kind)).toEqual(webKinds);
  });
});

describe("sanitizeLayoutForSave", () => {
  it("accepts preset names and refuses unknown ones", () => {
    expect(sanitizeLayoutForSave("modern")).toBe("modern");
    expect(sanitizeLayoutForSave("fancy")).toBeNull();
  });

  it("refuses a layout the printer would not parse", () => {
    expect(sanitizeLayoutForSave({ version: 1, blocks: [] })).toBeNull();
  });
});

describe("setBlockStyle", () => {
  it("keeps a text block's alignment on the block, where old builds read it", () => {
    const next = setBlockStyle({ kind: "text", text: "Hi" }, { align: "right", bold: true });
    expect(next).toEqual({ kind: "text", text: "Hi", align: "right", style: { bold: true } });
  });

  it("drops the style entirely once every field is back to default", () => {
    const styled = setBlockStyle({ kind: "businessName" }, { size: "large" });
    expect(setBlockStyle(styled, { size: undefined })).toEqual({ kind: "businessName" });
  });

  it("describes what the merchant changed", () => {
    expect(describeBlockStyle({ kind: "orderNumber", style: { size: "large", bold: true } })).toBe("Large · Bold");
    expect(describeBlockStyle({ kind: "orderNumber" })).toBeNull();
  });
});
