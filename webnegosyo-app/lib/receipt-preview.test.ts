import {
  BLOCK_SAMPLES,
  buildPreviewBlocks,
  paperFontSize,
  sampleReceiptSegments,
  MONO_CHAR_RATIO,
  SAMPLE_ORDER,
  SAMPLE_TRACKING_URL,
} from "./receipt-preview";
import { BLOCK_PALETTE } from "./receipt-editor";
import { initialStudioState, layoutOf } from "./receipt-studio";
import { renderReceiptSegments } from "./receipt-layout";

const CONFIG = { storeName: "Sukad", logoUrl: null, columns: 32 };

describe("buildPreviewBlocks", () => {
  it("gives every block its own share of the paper, in order", () => {
    const { draft } = initialStudioState("modern");
    const blocks = buildPreviewBlocks(draft.drafts, layoutOf(draft), CONFIG);
    expect(blocks.map((b) => b.id)).toEqual(draft.drafts.map((d) => d.id));
    expect(blocks.find((b) => b.kind === "businessName")?.segments).not.toHaveLength(0);
  });

  it("says why a block prints nothing instead of hiding it", () => {
    const { draft } = initialStudioState({ version: 1, blocks: [{ kind: "logo" }, { kind: "items" }] });
    const [logo, items] = buildPreviewBlocks(draft.drafts, layoutOf(draft), CONFIG);
    expect(logo!.segments).toHaveLength(0);
    expect(logo!.emptyHint).toBe("No logo uploaded yet");
    expect(items!.emptyHint).toBeNull();
  });

  it("draws the tracking QR from the sample link", () => {
    const { draft } = initialStudioState({ version: 1, blocks: [{ kind: "qr" }] });
    const [qr] = buildPreviewBlocks(draft.drafts, layoutOf(draft), CONFIG);
    expect(qr!.segments).toContainEqual({ type: "qr", data: SAMPLE_TRACKING_URL });
  });

  it("is empty for an empty stack", () => {
    expect(buildPreviewBlocks([], { version: 1, blocks: [] }, CONFIG)).toEqual([]);
  });
});

describe("sampleReceiptSegments", () => {
  it("is exactly what the engine prints for the sample sale", () => {
    const { draft } = initialStudioState("classic");
    const layout = layoutOf(draft);
    const segments = sampleReceiptSegments(layout, CONFIG);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments).toEqual(
      renderReceiptSegments(
        SAMPLE_ORDER,
        { storeName: "Sukad", width: 32, trackingUrl: SAMPLE_TRACKING_URL },
        layout,
      ),
    );
  });

  it("prints on the chosen paper width", () => {
    const layout = layoutOf(initialStudioState("classic").draft);
    const narrow = sampleReceiptSegments(layout, CONFIG);
    const wide = sampleReceiptSegments(layout, { ...CONFIG, columns: 48 });
    const longest = (segs: typeof narrow) =>
      Math.max(...segs.flatMap((s) => (s.type === "text" ? s.text.split("\n").map((l) => l.length) : [0])));
    expect(longest(narrow)).toBeLessThanOrEqual(32);
    expect(longest(wide)).toBeGreaterThan(32);
  });
});

describe("paperFontSize", () => {
  it("fits the paper's columns into the space it has", () => {
    const size = paperFontSize(300, 32);
    expect(size * MONO_CHAR_RATIO * 32).toBeLessThanOrEqual(300);
    expect(size).toBeGreaterThan(14);
  });

  it("shrinks for an 80mm roll", () => {
    expect(paperFontSize(300, 48)).toBeLessThan(paperFontSize(300, 32));
  });

  it("never collapses to nothing before layout is measured", () => {
    expect(paperFontSize(0, 32)).toBeGreaterThan(0);
  });
});

describe("BLOCK_SAMPLES", () => {
  it("has a snippet for every block in the library", () => {
    for (const { kind } of BLOCK_PALETTE) expect(BLOCK_SAMPLES[kind]).toBeTruthy();
  });
});
