/**
 * The reads and the saved draft behind End shift & remit.
 *
 * - `useClosePreview`: `preview_shift_close` on the shared cache (re-read
 *   after a count, so a recount sees the latest attempt count).
 * - `useEndShiftDraft`: the count in progress, saved per store + shift on this
 *   tablet the moment it changes, and dropped once the shift is closed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { useResource } from "../query/use-resource";
import { previewShiftClose, type CashRpcResult, type ShiftClosePreview } from "./shift-close";
import { draftStorageKey, emptyDraft, parseDraft, serializeDraft, type CountMode, type EndShiftDraft } from "./shift-end-flow";

export const CLOSE_PREVIEW_RESOURCE = "cash-close-preview";

export function useClosePreview(shiftId: string | null) {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const fetcher = useCallback(() => previewShiftClose(shiftId as string), [shiftId]);
  return useResource<CashRpcResult<ShiftClosePreview>>(
    tenantId && shiftId ? resourceKey(CLOSE_PREVIEW_RESOURCE, tenantId, shiftId) : null,
    fetcher,
    { staleTime: 0 },
  );
}

export interface EndShiftDraftState {
  draft: EndShiftDraft | null;
  update: (change: (draft: EndShiftDraft) => EndShiftDraft) => void;
  clear: () => Promise<void>;
}

/** Null until the saved draft (if any) is read, so the first render never overwrites it. */
export function useEndShiftDraft(tenantId: string | null, shiftId: string | null, defaultMode: CountMode): EndShiftDraftState {
  const [draft, setDraft] = useState<EndShiftDraft | null>(null);
  const key = tenantId && shiftId ? draftStorageKey(tenantId, shiftId) : null;
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!key || !shiftId) return;
    let isActive = true;
    AsyncStorage.getItem(key)
      .catch(() => null)
      .then((raw) => {
        if (isActive) setDraft(parseDraft(raw, shiftId) ?? emptyDraft(shiftId, defaultMode));
      });
    return () => {
      isActive = false;
    };
    // The default mode only seeds a NEW draft; a saved one keeps the mode it was counted in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, shiftId]);

  const update = useCallback((change: (current: EndShiftDraft) => EndShiftDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const next = change(current);
      const storageKey = keyRef.current;
      if (storageKey) {
        AsyncStorage.setItem(storageKey, serializeDraft(next)).catch((error) => {
          console.warn("[end-shift] could not save the count on this tablet", error);
        });
      }
      return next;
    });
  }, []);

  const clear = useCallback(async () => {
    const storageKey = keyRef.current;
    if (storageKey) await AsyncStorage.removeItem(storageKey).catch(() => undefined);
  }, []);

  return { draft, update, clear };
}
