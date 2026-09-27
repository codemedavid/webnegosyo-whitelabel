import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  resolveReceiptLayout,
  resolveReceiptTheme,
  type ReceiptBlock,
  type ReceiptBlockKind,
  type ReceiptLayout,
  type ReceiptPresetName,
  type ReceiptTheme,
} from "./receipt-layout";
import {
  duplicateDraft,
  insertDraftAfter,
  isReceiptPresetName,
  moveDraft,
  sanitizeLayoutForSave,
  seedBlock,
  splitOrderMetaDraft,
  ORDER_META_PARTS,
  type DraftBlock,
} from "./receipt-editor";

/**
 * The Receipt editor's state, as one pure reducer.
 *
 * Same model as the web Studio (`use-receipt-studio.ts`): picking a template
 * seeds the stack from it and publishes the template's NAME (so later
 * improvements to that template reach the store); the first edit of any kind
 * turns the draft custom, which publishes the block stack itself.
 *
 * What the phone adds is forgiveness. Every change that alters the paper is
 * undoable, because a merchant editing one-handed at the counter WILL fat-
 * finger "Remove" — and typing into a field is one undo step per field, not
 * one per letter.
 */

export type StudioMode = ReceiptPresetName | "custom";

export interface ReceiptTemplate {
  name: ReceiptPresetName;
  label: string;
  description: string;
  layout: ReceiptLayout;
}

/** The starting points the editor offers, Modern (the default) first. */
export const RECEIPT_TEMPLATES: readonly ReceiptTemplate[] = [
  { name: "modern", label: "Modern", description: "Big name, headline order #, QR", layout: MODERN_RECEIPT_LAYOUT },
  { name: "classic", label: "Classic", description: "The flat, ruled slip", layout: CLASSIC_RECEIPT_LAYOUT },
  { name: "compact", label: "Compact", description: "Short — saves paper", layout: COMPACT_RECEIPT_LAYOUT },
  { name: "detailed", label: "Detailed", description: "Adds contact and QR", layout: DETAILED_RECEIPT_LAYOUT },
];

export function templateLayout(name: ReceiptPresetName): ReceiptLayout {
  return RECEIPT_TEMPLATES.find((t) => t.name === name)?.layout ?? MODERN_RECEIPT_LAYOUT;
}

export interface StudioDraft {
  mode: StudioMode;
  theme: ReceiptTheme;
  isBold: boolean;
  drafts: DraftBlock[];
}

export interface StudioState {
  draft: StudioDraft;
  /** Earlier drafts, newest last. */
  past: StudioDraft[];
  selectedId: string | null;
  /** Counter behind every block id, so the reducer stays deterministic. */
  idSeq: number;
  /** The field being typed into; consecutive keystrokes share one undo step. */
  typingKey: string | null;
}

/** Deep enough for a long session, small enough to never matter for memory. */
export const UNDO_LIMIT = 50;

export type StudioAction =
  | { type: "load"; saved: unknown }
  | { type: "select"; id: string | null }
  | { type: "selectTemplate"; name: ReceiptPresetName }
  /** `field` names a typed-into field; repeated edits to it coalesce. */
  | { type: "updateBlock"; id: string; block: ReceiptBlock; field?: string }
  | { type: "insertBlock"; kind: ReceiptBlockKind }
  | { type: "removeBlock"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; offset: -1 | 1 }
  | { type: "splitOrderMeta"; id: string }
  | { type: "setTheme"; theme: ReceiptTheme }
  | { type: "setBold"; isBold: boolean }
  | { type: "undo" };

function modeOf(saved: unknown): StudioMode {
  if (saved === null || saved === undefined) return "modern";
  if (typeof saved === "string") return isReceiptPresetName(saved) ? saved : "modern";
  return "custom";
}

function withIds(blocks: ReceiptBlock[], idSeq: number): { drafts: DraftBlock[]; idSeq: number } {
  const drafts = blocks.map((block, i) => ({ id: `b${idSeq + i + 1}`, block }));
  return { drafts, idSeq: idSeq + blocks.length };
}

function freshState(saved: unknown, idSeq: number): StudioState {
  const layout = resolveReceiptLayout(saved);
  const seeded = withIds(layout.blocks, idSeq);
  return {
    draft: {
      mode: modeOf(saved),
      theme: resolveReceiptTheme(layout),
      isBold: layout.bold === true,
      drafts: seeded.drafts,
    },
    past: [],
    selectedId: null,
    idSeq: seeded.idSeq,
    typingKey: null,
  };
}

export function initialStudioState(saved: unknown): StudioState {
  return freshState(saved, 0);
}

/** Record `next` as an undoable change (unless it changes nothing). */
function commit(state: StudioState, next: StudioDraft, extra: Partial<StudioState> = {}): StudioState {
  if (next === state.draft) return { ...state, ...extra };
  const past = [...state.past, state.draft].slice(-UNDO_LIMIT);
  return { ...state, draft: next, past, typingKey: null, ...extra };
}

/** Every edit goes through here: it is what turns a template custom. */
function editDrafts(state: StudioState, drafts: DraftBlock[]): StudioDraft {
  if (drafts === state.draft.drafts) return state.draft;
  return { ...state.draft, drafts, mode: "custom" };
}

function nextId(state: StudioState): { id: string; idSeq: number } {
  const idSeq = state.idSeq + 1;
  return { id: `b${idSeq}`, idSeq };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "load":
      // Ids keep counting so a reloaded block never reuses a stale id.
      return freshState(action.saved, state.idSeq);

    case "select":
      return { ...state, selectedId: action.id, typingKey: null };

    case "selectTemplate": {
      const template = templateLayout(action.name);
      const seeded = withIds(template.blocks, state.idSeq);
      const next: StudioDraft = {
        mode: action.name,
        theme: resolveReceiptTheme(template),
        isBold: false,
        drafts: seeded.drafts,
      };
      return commit(state, next, { selectedId: null, idSeq: seeded.idSeq });
    }

    case "updateBlock": {
      const drafts = state.draft.drafts.map((d) => (d.id === action.id ? { ...d, block: action.block } : d));
      const next = editDrafts(state, drafts);
      const key = action.field ? `${action.id}:${action.field}` : null;
      // Still typing into the same field: replace the draft, keep one undo step.
      if (key !== null && key === state.typingKey) return { ...state, draft: next };
      return { ...commit(state, next), typingKey: key };
    }

    case "insertBlock": {
      const { id, idSeq } = nextId(state);
      const drafts = insertDraftAfter(state.draft.drafts, state.selectedId, { id, block: seedBlock(action.kind) });
      return commit(state, editDrafts(state, drafts), { selectedId: id, idSeq });
    }

    case "removeBlock": {
      const drafts = state.draft.drafts.filter((d) => d.id !== action.id);
      if (drafts.length === state.draft.drafts.length) return state;
      const selectedId = state.selectedId === action.id ? null : state.selectedId;
      return commit(state, editDrafts(state, drafts), { selectedId });
    }

    case "duplicate": {
      const { id, idSeq } = nextId(state);
      const drafts = duplicateDraft(state.draft.drafts, action.id, id);
      if (drafts === state.draft.drafts) return state;
      return commit(state, editDrafts(state, drafts), { selectedId: id, idSeq });
    }

    case "move":
      return commit(state, editDrafts(state, moveDraft(state.draft.drafts, action.id, action.offset)));

    case "splitOrderMeta": {
      let idSeq = state.idSeq;
      const makeId = () => `b${++idSeq}`;
      const drafts = splitOrderMetaDraft(state.draft.drafts, action.id, makeId);
      if (drafts === state.draft.drafts) return state;
      const firstId = `b${state.idSeq + 1}`;
      return commit(state, editDrafts(state, drafts), { selectedId: firstId, idSeq });
    }

    case "setTheme":
      if (action.theme === state.draft.theme) return state;
      return commit(state, { ...state.draft, theme: action.theme, mode: "custom" });

    case "setBold":
      if (action.isBold === state.draft.isBold) return state;
      return commit(state, { ...state.draft, isBold: action.isBold, mode: "custom" });

    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      const stillThere = previous.drafts.some((d) => d.id === state.selectedId);
      return {
        ...state,
        draft: previous,
        past: state.past.slice(0, -1),
        selectedId: stillThere ? state.selectedId : null,
        typingKey: null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function layoutOf(draft: StudioDraft): ReceiptLayout {
  if (draft.mode !== "custom") return templateLayout(draft.mode);
  return {
    version: 1,
    theme: draft.theme,
    ...(draft.isBold ? { bold: true } : {}),
    blocks: draft.drafts.map((d) => d.block),
  };
}

/** What Publish writes — a template name or the custom layout. */
export function payloadOf(draft: StudioDraft): ReceiptPresetName | ReceiptLayout {
  return draft.mode === "custom" ? layoutOf(draft) : draft.mode;
}

/** Comparable identity of what a draft would publish. */
export function draftKey(draft: StudioDraft): string {
  return JSON.stringify(payloadOf(draft));
}

/** The key of what is saved on the store right now. */
export function savedKey(saved: unknown): string {
  return draftKey(initialStudioState(saved).draft);
}

export interface PublishProblem {
  /** The block to select so the merchant lands on the fix; null = no block. */
  blockId: string | null;
  message: string;
}

/** Why Publish must refuse this draft, or null when it can go out. */
export function publishProblem(draft: StudioDraft): PublishProblem | null {
  if (draft.mode !== "custom") return null;
  if (draft.drafts.length === 0) {
    return { blockId: null, message: "Add at least one block — an empty receipt prints nothing." };
  }
  const blankFillIn = draft.drafts.find((d) => d.block.kind === "fillIn" && d.block.label.trim() === "");
  if (blankFillIn) {
    return { blockId: blankFillIn.id, message: "Give this fill-in line a label — it's what the customer fills in." };
  }
  const blankText = draft.drafts.find((d) => d.block.kind === "text" && d.block.text.trim() === "");
  if (blankText) {
    return { blockId: blankText.id, message: "This text block is empty. Type something or remove it." };
  }
  if (sanitizeLayoutForSave(payloadOf(draft)) === null) {
    return { blockId: null, message: "Something in this layout can't be printed. Undo your last change and try again." };
  }
  return null;
}

/**
 * Whether this build can edit what the store has saved. A layout designed on
 * the web with a block this app does not know yet reads as garbage here — it
 * would open as Modern, and publishing would overwrite the real design.
 */
export function isSavedLayoutReadable(saved: unknown): boolean {
  if (saved === null || saved === undefined) return true;
  return sanitizeLayoutForSave(saved) !== null;
}

/** "Modern template" / "Custom design" — what the store prints, in a few words. */
export function describeMode(mode: StudioMode): string {
  if (mode === "custom") return "Custom design";
  const template = RECEIPT_TEMPLATES.find((t) => t.name === mode);
  return `${template?.label ?? "Modern"} template`;
}

/** How many lines an all-in-one details block becomes when split. */
export const ORDER_META_LINE_COUNT = ORDER_META_PARTS.length;
