import {
  draftKey,
  initialStudioState,
  isSavedLayoutReadable,
  layoutOf,
  payloadOf,
  publishProblem,
  savedKey,
  studioReducer,
  UNDO_LIMIT,
  type StudioAction,
  type StudioState,
} from "./receipt-studio";
import { CLASSIC_RECEIPT_LAYOUT, MODERN_RECEIPT_LAYOUT } from "./receipt-layout";
import { sanitizeLayoutForSave } from "./receipt-editor";

const run = (state: StudioState, ...actions: StudioAction[]) => actions.reduce(studioReducer, state);

const CUSTOM = {
  version: 1,
  theme: "classic",
  blocks: [{ kind: "businessName" }, { kind: "divider", char: "-" }, { kind: "items" }, { kind: "totals" }],
};

describe("loading what the store has saved", () => {
  it("opens an empty column as the Modern template", () => {
    const state = initialStudioState(null);
    expect(state.draft.mode).toBe("modern");
    expect(state.draft.drafts.map((d) => d.block)).toEqual(MODERN_RECEIPT_LAYOUT.blocks);
  });

  it("opens a saved preset name as that template", () => {
    expect(initialStudioState("classic").draft.mode).toBe("classic");
  });

  it("opens a custom layout as custom, with its theme", () => {
    const state = initialStudioState(CUSTOM);
    expect(state.draft.mode).toBe("custom");
    expect(state.draft.theme).toBe("classic");
    expect(state.draft.drafts).toHaveLength(4);
  });

  it("gives every block a distinct id", () => {
    const ids = initialStudioState(CUSTOM).draft.drafts.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never reuses an id after a reload", () => {
    const first = initialStudioState(CUSTOM);
    const reloaded = studioReducer(first, { type: "load", saved: CUSTOM });
    const before = new Set(first.draft.drafts.map((d) => d.id));
    expect(reloaded.draft.drafts.some((d) => before.has(d.id))).toBe(false);
  });
});

describe("editing turns a template custom", () => {
  it("publishes a template's NAME until the first edit", () => {
    const state = initialStudioState("classic");
    expect(payloadOf(state.draft)).toBe("classic");
    const edited = run(state, { type: "insertBlock", kind: "feed" });
    expect(edited.draft.mode).toBe("custom");
    expect(payloadOf(edited.draft)).toMatchObject({ version: 1, theme: "classic" });
  });

  it("switching template replaces the stack and is not custom", () => {
    const state = run(initialStudioState(CUSTOM), { type: "selectTemplate", name: "compact" });
    expect(state.draft.mode).toBe("compact");
    expect(payloadOf(state.draft)).toBe("compact");
  });

  it("writes bold only when it is on", () => {
    const state = initialStudioState(CUSTOM);
    expect(layoutOf(state.draft)).not.toHaveProperty("bold");
    expect(layoutOf(run(state, { type: "setBold", isBold: true }).draft).bold).toBe(true);
  });
});

describe("arranging blocks", () => {
  it("inserts a new block below the selected one and selects it", () => {
    const state = initialStudioState(CUSTOM);
    const firstId = state.draft.drafts[0]!.id;
    const next = run(state, { type: "select", id: firstId }, { type: "insertBlock", kind: "qr" });
    expect(next.draft.drafts[1]!.block).toEqual({ kind: "qr" });
    expect(next.selectedId).toBe(next.draft.drafts[1]!.id);
  });

  it("appends at the end when nothing is selected", () => {
    const next = run(initialStudioState(CUSTOM), { type: "insertBlock", kind: "feed" });
    expect(next.draft.drafts.at(-1)!.block).toEqual({ kind: "feed" });
  });

  it("seeds a text block with something to edit", () => {
    const next = run(initialStudioState(CUSTOM), { type: "insertBlock", kind: "text" });
    expect(next.draft.drafts.at(-1)!.block).toMatchObject({ kind: "text", text: "Your note here" });
  });

  it("moves a block and keeps it selected", () => {
    const state = initialStudioState(CUSTOM);
    const itemsId = state.draft.drafts[2]!.id;
    const next = run(state, { type: "select", id: itemsId }, { type: "move", id: itemsId, offset: -1 });
    expect(next.draft.drafts[1]!.id).toBe(itemsId);
    expect(next.selectedId).toBe(itemsId);
  });

  it("does nothing when moving the top block up", () => {
    const state = initialStudioState(CUSTOM);
    const next = studioReducer(state, { type: "move", id: state.draft.drafts[0]!.id, offset: -1 });
    expect(next.draft).toBe(state.draft);
    expect(next.past).toHaveLength(0);
  });

  it("duplicates a block with its style, right below it", () => {
    const state = initialStudioState({
      version: 1,
      blocks: [{ kind: "orderNumber", label: "Queue", style: { size: "large" } }, { kind: "items" }],
    });
    const id = state.draft.drafts[0]!.id;
    const next = studioReducer(state, { type: "duplicate", id });
    expect(next.draft.drafts[1]!.block).toEqual({ kind: "orderNumber", label: "Queue", style: { size: "large" } });
    expect(next.draft.drafts[1]!.block).not.toBe(next.draft.drafts[0]!.block);
    expect(next.selectedId).toBe(next.draft.drafts[1]!.id);
  });

  it("removes a block and drops the selection", () => {
    const state = initialStudioState(CUSTOM);
    const id = state.draft.drafts[1]!.id;
    const next = run(state, { type: "select", id }, { type: "removeBlock", id });
    expect(next.draft.drafts).toHaveLength(3);
    expect(next.selectedId).toBeNull();
  });

  it("splits all-in-one details into one selectable block per line", () => {
    const state = initialStudioState({ version: 1, blocks: [{ kind: "orderMeta" }, { kind: "items" }] });
    const next = studioReducer(state, { type: "splitOrderMeta", id: state.draft.drafts[0]!.id });
    expect(next.draft.drafts.map((d) => d.block.kind)).toEqual([
      "orderNumber",
      "orderDate",
      "customerName",
      "orderType",
      "tableNumber",
      "items",
    ]);
    expect(next.selectedId).toBe(next.draft.drafts[0]!.id);
    const ids = next.draft.drafts.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("undo", () => {
  it("brings back a removed block", () => {
    const state = initialStudioState(CUSTOM);
    const removed = studioReducer(state, { type: "removeBlock", id: state.draft.drafts[0]!.id });
    const restored = studioReducer(removed, { type: "undo" });
    expect(restored.draft).toEqual(state.draft);
  });

  it("brings back a custom stack replaced by a template", () => {
    const state = initialStudioState(CUSTOM);
    const restored = run(state, { type: "selectTemplate", name: "modern" }, { type: "undo" });
    expect(restored.draft.mode).toBe("custom");
    expect(restored.draft.drafts).toEqual(state.draft.drafts);
  });

  it("treats typing into one field as a single step", () => {
    const state = initialStudioState({ version: 1, blocks: [{ kind: "text", text: "Hi" }] });
    const id = state.draft.drafts[0]!.id;
    const typed = run(
      state,
      { type: "updateBlock", id, block: { kind: "text", text: "Hi!" }, field: "text" },
      { type: "updateBlock", id, block: { kind: "text", text: "Hi!!" }, field: "text" },
      { type: "updateBlock", id, block: { kind: "text", text: "Hi!!!" }, field: "text" },
    );
    expect(typed.past).toHaveLength(1);
    expect(studioReducer(typed, { type: "undo" }).draft.drafts[0]!.block).toEqual({ kind: "text", text: "Hi" });
  });

  it("gives each style tap its own step", () => {
    const state = initialStudioState(CUSTOM);
    const id = state.draft.drafts[0]!.id;
    const next = run(
      state,
      { type: "updateBlock", id, block: { kind: "businessName", style: { bold: true } } },
      { type: "updateBlock", id, block: { kind: "businessName", style: { bold: false } } },
    );
    expect(next.past).toHaveLength(2);
  });

  it("clears a selection whose block the undo took away", () => {
    const inserted = run(initialStudioState(CUSTOM), { type: "insertBlock", kind: "qr" });
    expect(inserted.selectedId).not.toBeNull();
    expect(studioReducer(inserted, { type: "undo" }).selectedId).toBeNull();
  });

  it("is a no-op with nothing to undo", () => {
    const state = initialStudioState(CUSTOM);
    expect(studioReducer(state, { type: "undo" })).toBe(state);
  });

  it(`keeps at most ${UNDO_LIMIT} steps`, () => {
    let state = initialStudioState(CUSTOM);
    for (let i = 0; i < UNDO_LIMIT + 10; i++) {
      state = studioReducer(state, { type: "setBold", isBold: i % 2 === 0 });
    }
    expect(state.past).toHaveLength(UNDO_LIMIT);
  });
});

describe("dirty tracking", () => {
  it("a freshly loaded draft matches what is saved", () => {
    for (const saved of [null, "classic", CUSTOM]) {
      expect(draftKey(initialStudioState(saved).draft)).toBe(savedKey(saved));
    }
  });

  it("what a publish saves reads back as clean", () => {
    const edited = run(initialStudioState("classic"), { type: "insertBlock", kind: "qr" }, { type: "setBold", isBold: true });
    const saved = sanitizeLayoutForSave(payloadOf(edited.draft));
    expect(savedKey(saved)).toBe(draftKey(edited.draft));
  });

  it("an edit then its undo is clean again", () => {
    const state = initialStudioState(CUSTOM);
    const back = run(state, { type: "setTheme", theme: "modern" }, { type: "undo" });
    expect(draftKey(back.draft)).toBe(savedKey(CUSTOM));
  });
});

describe("publishProblem", () => {
  it("lets a template go out as it is", () => {
    expect(publishProblem(initialStudioState("detailed").draft)).toBeNull();
  });

  it("refuses an empty receipt", () => {
    const state = initialStudioState({ version: 1, blocks: [{ kind: "items" }] });
    const empty = studioReducer(state, { type: "removeBlock", id: state.draft.drafts[0]!.id });
    expect(publishProblem(empty.draft)?.message).toMatch(/at least one block/);
  });

  it("points at a fill-in line with no label", () => {
    const state = initialStudioState({ version: 1, blocks: [{ kind: "fillIn", label: "Name" }] });
    const id = state.draft.drafts[0]!.id;
    const blank = studioReducer(state, { type: "updateBlock", id, block: { kind: "fillIn", label: "" } });
    expect(publishProblem(blank.draft)?.blockId).toBe(id);
  });

  it("points at an empty text block", () => {
    const state = initialStudioState({ version: 1, blocks: [{ kind: "text", text: "Hi" }] });
    const id = state.draft.drafts[0]!.id;
    const blank = studioReducer(state, { type: "updateBlock", id, block: { kind: "text", text: "  " } });
    expect(publishProblem(blank.draft)?.blockId).toBe(id);
  });

  it("refuses a label longer than the printer accepts", () => {
    const state = initialStudioState({ version: 1, blocks: [{ kind: "orderNumber" }] });
    const id = state.draft.drafts[0]!.id;
    const long = studioReducer(state, { type: "updateBlock", id, block: { kind: "orderNumber", label: "x".repeat(40) } });
    expect(publishProblem(long.draft)).not.toBeNull();
  });
});

describe("isSavedLayoutReadable", () => {
  it("reads nothing, presets and valid layouts", () => {
    expect(isSavedLayoutReadable(null)).toBe(true);
    expect(isSavedLayoutReadable("compact")).toBe(true);
    expect(isSavedLayoutReadable(CLASSIC_RECEIPT_LAYOUT)).toBe(true);
  });

  it("refuses a layout with a block this build does not know", () => {
    expect(isSavedLayoutReadable({ version: 1, blocks: [{ kind: "hologram" }] })).toBe(false);
  });
});
