/**
 * AI offer ideas on the shared cache.
 *
 * The list is one resource per tenant. Every action (find ideas, create,
 * dismiss, turn on) answers with the fresh state, which replaces the cached
 * copy — no second read, and the card never shows a half-updated list.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resourceKey } from "../backends/query-keys";
import { useResource } from "./use-resource";
import { setResourceData } from "./resource-cache";
import { callBoostAi, type BoostAiRequest, type BoostAiState } from "../boost-ai";

export const BOOST_AI_RESOURCE = "boost-ai";

export type BoostAiAction = "generate" | "enable" | "create" | "dismiss";

export interface BoostAiBusy {
  action: BoostAiAction;
  proposalId: string | null;
}

export interface UseBoostAiResult {
  state: BoostAiState | undefined;
  isLoading: boolean;
  loadError: string | null;
  refetch: () => Promise<void>;
  busy: BoostAiBusy | null;
  notice: string | null;
  actionError: string | null;
  generate: () => Promise<void>;
  enable: () => Promise<void>;
  create: (proposalId: string) => Promise<void>;
  dismiss: (proposalId: string) => Promise<void>;
}

export function useBoostAi(tenantId: string | null): UseBoostAiResult {
  const client = useQueryClient();
  const key = useMemo(() => (tenantId ? resourceKey(BOOST_AI_RESOURCE, tenantId) : null), [tenantId]);
  const fetcher = useCallback(
    async () => (await callBoostAi({ tenantId: tenantId as string, op: "state" })).state,
    [tenantId],
  );
  const resource = useResource<BoostAiState>(key, fetcher);
  const { refetch } = resource;

  const [busy, setBusy] = useState<BoostAiBusy | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = useCallback(
    async (request: BoostAiRequest, action: BoostAiAction, proposalId: string | null) => {
      if (!key) return;
      setBusy({ action, proposalId });
      setNotice(null);
      setActionError(null);
      try {
        const result = await callBoostAi(request);
        setResourceData<BoostAiState>(client, key, () => result.state);
        setNotice(result.notice);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        // The route may have moved things before failing (a quota claim, a status) — re-read.
        void refetch();
      } finally {
        setBusy(null);
      }
    },
    [client, key, refetch],
  );

  const generate = useCallback(
    () => run({ tenantId: tenantId as string, op: "generate" }, "generate", null),
    [run, tenantId],
  );
  const enable = useCallback(
    () => run({ tenantId: tenantId as string, op: "enable" }, "enable", null),
    [run, tenantId],
  );
  const create = useCallback(
    (proposalId: string) => run({ tenantId: tenantId as string, op: "create", proposalId }, "create", proposalId),
    [run, tenantId],
  );
  const dismiss = useCallback(
    (proposalId: string) => run({ tenantId: tenantId as string, op: "dismiss", proposalId }, "dismiss", proposalId),
    [run, tenantId],
  );

  return {
    state: resource.data,
    isLoading: resource.isLoading,
    loadError: resource.error,
    refetch,
    busy,
    notice,
    actionError,
    generate,
    enable,
    create,
    dismiss,
  };
}
