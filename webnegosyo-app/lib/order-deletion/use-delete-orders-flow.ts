/**
 * The delete-orders screen's state. Same fixed order as the web wizard:
 * choose → export (share the file) → confirm (store name + password). Any
 * change to the choice discards the export, so the file the owner saved always
 * lists exactly what the confirm step would delete.
 */
import { useCallback, useMemo, useState } from "react";
import { shareCsv } from "../export/share";
import { defaultSelection, type ReportSelection } from "../report-window";
import type { DeletionPreview, DeletionScope, DownloadedExport, ExecuteResult, ListedOrder } from "./client";
import { orderDeletionClient } from "./default-client";
import { selectionToDeletionRange } from "./range";

export type DeletionMode = "range" | "selected" | "all";
export type FlowStep = "choose" | "export" | "confirm" | "done";

const DEFAULT_DAYS = 30;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export function useDeleteOrdersFlow(tenantId: string) {
  const [step, setStep] = useState<FlowStep>("choose");
  const [mode, setModeState] = useState<DeletionMode>("range");
  const [selection, setSelectionState] = useState<ReportSelection>(() => defaultSelection(DEFAULT_DAYS));
  const [includeActive, setIncludeActiveState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [listedOrders, setListedOrders] = useState<ListedOrder[] | null>(null);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [exported, setExported] = useState<DownloadedExport | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => selectionToDeletionRange(selection, Date.now()), [selection]);

  const scope = useMemo<DeletionScope>(() => {
    if (mode === "all") return { kind: "all" };
    if (mode === "selected") return { kind: "selected", orderIds: [...selectedIds] };
    return { kind: "range", from: range.from, to: range.to };
  }, [mode, range, selectedIds]);

  const invalidate = useCallback(() => {
    setPreview(null);
    setExported(null);
    setError(null);
    setStep("choose");
  }, []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const setMode = (value: DeletionMode) => {
    setModeState(value);
    invalidate();
  };
  const setSelection = (value: ReportSelection) => {
    setSelectionState(value);
    setListedOrders(null);
    setSelectedIds(new Set());
    invalidate();
  };
  const setIncludeActive = (value: boolean) => {
    setIncludeActiveState(value);
    invalidate();
  };

  const toggleSelected = (orderId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
    invalidate();
  };

  const loadOrdersToPick = () =>
    run(async () => {
      const response = await orderDeletionClient.preview(
        tenantId,
        { scope: { kind: "range", from: range.from, to: range.to }, includeActive },
        true
      );
      setListedOrders(response.orders ?? []);
      setSelectedIds(new Set());
      invalidate();
    });

  const review = () =>
    run(async () => {
      const response = await orderDeletionClient.preview(tenantId, { scope, includeActive });
      setPreview(response.preview);
      if (response.preview.orderCount > 0) setStep("export");
    });

  const exportAndShare = () =>
    run(async () => {
      const file = await orderDeletionClient.exportOrders(tenantId, { scope, includeActive });
      // The ticket is only useful once the owner actually has the file.
      await shareCsv({ fileName: file.fileName, csv: file.csv });
      setExported(file);
      setStep("confirm");
    });

  const confirm = (password: string, confirmation: string) =>
    run(async () => {
      if (!exported) throw new Error("Save the export first.");
      const outcome = await orderDeletionClient.confirm(tenantId, {
        deletionId: exported.deletionId,
        password,
        confirmation,
      });
      setResult(outcome);
      setStep("done");
    });

  const startOver = () => {
    setResult(null);
    setListedOrders(null);
    setSelectedIds(new Set());
    invalidate();
  };

  return {
    step,
    mode,
    selection,
    range,
    includeActive,
    selectedIds,
    listedOrders,
    preview,
    exported,
    result,
    isBusy,
    error,
    setMode,
    setSelection,
    setIncludeActive,
    toggleSelected,
    loadOrdersToPick,
    review,
    exportAndShare,
    confirm,
    startOver,
  };
}

export type DeleteOrdersFlowState = ReturnType<typeof useDeleteOrdersFlow>;
