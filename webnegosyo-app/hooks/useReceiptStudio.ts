import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuthStore } from "../stores/auth-store";
import { usePrinterStore } from "../stores/printer-store";
import { supabase } from "../lib/supabase";
import { printForRole } from "../lib/printer";
import { DEFAULT_PAPER_WIDTH, printersForRole, type PaperWidth } from "../lib/printer-registry";
import { charsForPaperWidth } from "../lib/receipt-escpos";
import { blockLabel } from "../lib/receipt-editor";
import { fetchReceiptLayout, saveReceiptLayout } from "../lib/receipt-layout-service";
import { buildPreviewBlocks, sampleReceiptSegments, type PreviewConfig } from "../lib/receipt-preview";
import {
  RECEIPT_TEMPLATES,
  draftKey,
  initialStudioState,
  isSavedLayoutReadable,
  layoutOf,
  payloadOf,
  publishProblem,
  savedKey,
  studioReducer,
  type PublishProblem,
  type StudioAction,
} from "../lib/receipt-studio";
import type { ReceiptPresetName } from "../lib/receipt-layout";

/**
 * The Receipt editor's behaviour: the draft (a pure reducer in
 * lib/receipt-studio.ts), what is published, publishing, the sample print and
 * the one-line notices that carry Undo.
 *
 * The screen only lays these out. Nothing here renders.
 */

/** How long a notice stays up — long enough to reach Undo one-handed. */
const NOTICE_MS = 5_000;
/** How long the Publish button reads "Published" before settling. */
const PUBLISHED_FLASH_MS = 2_400;

export interface StudioNotice {
  id: number;
  message: string;
  tone: "neutral" | "success" | "error";
  action?: { label: string; onPress: () => void };
}

export type PublishStatus = "idle" | "publishing" | "published";
export type SamplePrintStatus = "idle" | "printing";

export function useReceiptStudio() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantName = useAuthStore((s) => s.tenantName);
  const isDemo = useAuthStore((s) => s.isDemo);
  const sessionLayout = useAuthStore((s) => s.receiptLayout);
  const sessionLogoUrl = useAuthStore((s) => s.receiptLogoUrl);
  const printers = usePrinterStore((s) => s.printers);
  const cashierPrinter = printersForRole(printers, "cashier")[0] ?? null;
  const printerPaperWidth: PaperWidth | null = cashierPrinter ? (cashierPrinter.paperWidth ?? DEFAULT_PAPER_WIDTH) : null;

  const [state, dispatch] = useReducer(studioReducer, sessionLayout, initialStudioState);
  const [published, setPublished] = useState<unknown>(sessionLayout);
  const [logoUrl, setLogoUrl] = useState<string | null>(sessionLogoUrl);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(printerPaperWidth ?? DEFAULT_PAPER_WIDTH);
  const [isSyncing, setIsSyncing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>("idle");
  const [printStatus, setPrintStatus] = useState<SamplePrintStatus>("idle");
  const [problem, setProblem] = useState<PublishProblem | null>(null);
  const [notice, setNotice] = useState<StudioNotice | null>(null);
  const timers = useRef<{ notice?: ReturnType<typeof setTimeout>; flash?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      clearTimeout(pending.notice);
      clearTimeout(pending.flash);
    };
  }, []);

  const isDirty = draftKey(state.draft) !== savedKey(published);
  const isReadable = isSavedLayoutReadable(published);
  const layout = useMemo(() => layoutOf(state.draft), [state.draft]);
  const columns = charsForPaperWidth(paperWidth);
  const preview: PreviewConfig = useMemo(
    () => ({ storeName: tenantName ?? "Your store", logoUrl, columns }),
    [tenantName, logoUrl, columns],
  );
  const previewBlocks = useMemo(
    () => buildPreviewBlocks(state.draft.drafts, layout, preview),
    [state.draft.drafts, layout, preview],
  );

  const showNotice = useCallback((next: Omit<StudioNotice, "id">) => {
    clearTimeout(timers.current.notice);
    setNotice({ ...next, id: Date.now() });
    timers.current.notice = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const undo = useCallback(() => {
    setProblem(null);
    setNotice(null);
    dispatch({ type: "undo" });
  }, []);

  /** Every change to the paper goes through here; a stale refusal goes with it. */
  const edit = useCallback((action: StudioAction) => {
    setProblem(null);
    dispatch(action);
  }, []);

  const undoAction = useMemo(() => ({ label: "Undo", onPress: undo }), [undo]);

  const removeBlock = (id: string) => {
    const target = state.draft.drafts.find((d) => d.id === id);
    edit({ type: "removeBlock", id });
    if (target) showNotice({ message: `Removed ${blockLabel(target.block.kind)}`, tone: "neutral", action: undoAction });
  };

  const pickTemplate = (name: ReceiptPresetName) => {
    const wasCustom = state.draft.mode === "custom";
    edit({ type: "selectTemplate", name });
    const label = RECEIPT_TEMPLATES.find((t) => t.name === name)?.label ?? name;
    showNotice({
      message: `Switched to ${label}`,
      tone: "neutral",
      ...(wasCustom ? { action: undoAction } : {}),
    });
  };

  const splitOrderMeta = (id: string) => {
    edit({ type: "splitOrderMeta", id });
    showNotice({ message: "Split into separate lines", tone: "neutral", action: undoAction });
  };

  /**
   * Pull the design the store has saved right now. With unsaved edits the
   * draft is never swapped out from under the merchant — but they are told
   * when someone else published meanwhile, since Publish would replace it.
   */
  const refresh = useCallback(async () => {
    if (!tenantId || isDemo) return;
    setIsSyncing(true);
    const outcome = await fetchReceiptLayout(supabase, tenantId);
    setIsSyncing(false);
    if (!outcome.ok) return;
    setLogoUrl(outcome.logoUrl);
    if (savedKey(outcome.layout) === savedKey(published)) return;
    setPublished(outcome.layout);
    // The printer reads the session copy; keep it as fresh as what we saw.
    useAuthStore.getState().setAuth({ receiptLayout: outcome.layout, receiptLogoUrl: outcome.logoUrl });
    if (!isDirty) {
      dispatch({ type: "load", saved: outcome.layout });
      return;
    }
    showNotice({
      message: "A newer receipt was published elsewhere. Publishing yours replaces it.",
      tone: "neutral",
      action: {
        label: "Load it",
        onPress: () => {
          setProblem(null);
          dispatch({ type: "load", saved: outcome.layout });
        },
      },
    });
  }, [tenantId, isDemo, isDirty, published, showNotice]);

  const discard = () => {
    setProblem(null);
    dispatch({ type: "load", saved: published });
  };

  const publish = async () => {
    if (isDemo) {
      showNotice({ message: "Demo store — sign in to publish your own receipt", tone: "neutral" });
      return;
    }
    if (!tenantId || publishStatus === "publishing") return;
    const found = publishProblem(state.draft);
    if (found) {
      setProblem(found);
      if (found.blockId) dispatch({ type: "select", id: found.blockId });
      else showNotice({ message: found.message, tone: "error" });
      return;
    }
    setPublishStatus("publishing");
    const outcome = await saveReceiptLayout(supabase, tenantId, payloadOf(state.draft));
    if (!outcome.ok) {
      setPublishStatus("idle");
      showNotice({ message: outcome.message, tone: "error", action: { label: "Retry", onPress: () => void publishRef.current() } });
      return;
    }
    setPublished(outcome.saved);
    useAuthStore.getState().setAuth({ receiptLayout: outcome.saved });
    dispatch({ type: "select", id: null });
    setPublishStatus("published");
    showNotice({ message: "Published — every receipt prints this way now", tone: "success" });
    clearTimeout(timers.current.flash);
    timers.current.flash = setTimeout(() => setPublishStatus("idle"), PUBLISHED_FLASH_MS);
  };

  // Retry runs from a notice that outlives this render; through the ref it
  // publishes the draft as it is when tapped, not as it was when it failed.
  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  });

  /** The draft, on the counter printer's own roll — the real thing, before publishing. */
  const printSample = async (onNoPrinter: () => void) => {
    if (!cashierPrinter) {
      showNotice({ message: "No receipt printer on this phone yet", tone: "neutral", action: { label: "Set up", onPress: onNoPrinter } });
      return;
    }
    if (printStatus === "printing") return;
    setPrintStatus("printing");
    const segments = sampleReceiptSegments(layout, {
      ...preview,
      columns: charsForPaperWidth(cashierPrinter.paperWidth ?? DEFAULT_PAPER_WIDTH),
    });
    const outcome = await printForRole("cashier", segments);
    setPrintStatus("idle");
    showNotice(
      outcome.anySuccess
        ? { message: `Sample sent to ${cashierPrinter.name}`, tone: "success" }
        : { message: `${cashierPrinter.name} didn't respond. Check it's on and nearby.`, tone: "error" },
    );
  };

  return {
    state,
    layout,
    previewBlocks,
    preview,
    paperWidth,
    setPaperWidth,
    printerPaperWidth,
    isDirty,
    isReadable,
    isSyncing,
    isDemo,
    canUndo: state.past.length > 0,
    publishStatus,
    printStatus,
    problem,
    notice,
    dismissNotice,
    edit,
    undo,
    removeBlock,
    pickTemplate,
    splitOrderMeta,
    refresh,
    discard,
    publish,
    printSample,
  };
}

export type ReceiptStudio = ReturnType<typeof useReceiptStudio>;
