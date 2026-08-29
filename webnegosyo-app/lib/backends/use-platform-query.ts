/**
 * The React half of the platform-Supabase read path.
 *
 * Extracted from `lib/hooks.ts` so it is a LEAF module — its only imports are
 * React, the supabase client, and the pure backend modules — and can therefore
 * be exercised with `renderHook` without dragging `convex/react` and the auth
 * store into the test. `lib/hooks.ts` remains the only dispatch point; screens
 * never import this file directly.
 */

import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { withPlatformTimeout } from "./platform-call";
import { runPlatformQuery, type PlatformClient } from "./supabase-adapter";
import {
  buildOrderSubscription,
  isOrderChangeInScope,
  isRefRealtimeBacked,
  resolvePollMs,
  resolveRealtimeStatus,
  type OrderChangePayload,
  type RealtimeStatus,
} from "./supabase-realtime";
import type { BranchScope } from "../branch-scope";

export interface SafeQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: string | null;
  /**
   * True when the query failed because the function does not exist on the
   * deployed backend (i.e. the tenant's Convex deployment is running an older
   * bundle that predates this function). Screens use this to show a "needs a
   * backend update" placeholder instead of silently hiding the section.
   */
  isMissingFunction: boolean;
}

export const platformClient = supabase as unknown as PlatformClient;

/**
 * Distinguishes concurrent subscribers on the same tenant so their realtime
 * channels do not collide. Module-scoped counter rather than a random id so it
 * stays deterministic and readable in the Supabase dashboard.
 */
let channelInstanceCounter = 0;

/**
 * Fetch a function ref from the platform Supabase adapter.
 *
 * Always called (never behind a condition) so the hook order stays identical on
 * every render regardless of which backend a tenant uses; it simply does
 * nothing when `tenantId` is null.
 */
export function usePlatformQuery<T>(
  refName: string,
  args: Record<string, unknown> | "skip" | undefined,
  tenantId: string | null,
  scope: BranchScope
): SafeQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disconnected");

  // Screens pass fresh object literals every render, so the object identity
  // changes constantly. Key the effect on the serialized args instead, or the
  // fetch loops forever.
  const argsKey = JSON.stringify(args ?? {});
  const isSkipped = args === "skip" || !tenantId;

  // The branch is part of what the query asked for. Left out of the effect's
  // dependencies, a session that resolves its branch after the first fetch would
  // keep showing the unscoped result until the next poll.
  const scopeKey = scope.kind === "all" ? "all" : `branch:${scope.outletId}`;

  // What the query is ABOUT. When this changes the previous data answers a
  // different question, so `isLoading` must re-arm — without it, switching
  // store or period silently presents the old tenant/period's numbers until
  // the new fetch lands. Deliberately excludes `realtimeStatus`, whose changes
  // restart the poll timer but do not change the question.
  const identityKey = `${refName}|${argsKey}|${tenantId ?? ""}|${scopeKey}`;
  const lastIdentityRef = useRef(identityKey);

  // Lets the realtime subscription trigger a re-read without depending on the
  // fetch effect's identity, so an incoming order does not resubscribe.
  const reloadRef = useRef<() => void>(() => {});

  // Stable for the lifetime of this hook instance.
  const instanceKeyRef = useRef<string>("");
  if (!instanceKeyRef.current) {
    channelInstanceCounter += 1;
    instanceKeyRef.current = String(channelInstanceCounter);
  }

  useEffect(() => {
    if (isSkipped) {
      setIsLoading(false);
      return;
    }

    if (lastIdentityRef.current !== identityKey) {
      lastIdentityRef.current = identityKey;
      setIsLoading(true);
    }

    let isCurrent = true;

    const load = async () => {
      try {
        const result = await withPlatformTimeout(
          runPlatformQuery(
            platformClient,
            tenantId,
            refName,
            JSON.parse(argsKey),
            scope
          ),
          refName
        );
        if (!isCurrent) return;
        setData(result as T);
        setError(null);
      } catch (e: unknown) {
        if (!isCurrent) return;
        const message = e instanceof Error ? e.message : String(e);
        console.error("[usePlatformQuery] " + refName + ":", message);
        setError(message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    reloadRef.current = () => {
      void load();
    };

    load();
    // Realtime is the primary path once connected; this interval drops to a
    // slow safety net then, and speeds back up if the socket goes away.
    const timer = setInterval(load, resolvePollMs(realtimeStatus));

    return () => {
      isCurrent = false;
      clearInterval(timer);
    };
    // `scopeKey` rather than `scope` alone: the hook memoises the object, but a
    // value-identity key means a re-resolved-but-equal scope cannot restart the
    // poll timer.
  }, [refName, argsKey, tenantId, isSkipped, realtimeStatus, scopeKey, scope, identityKey]);

  // Subscribe to this tenant's order changes so a new order lands immediately
  // instead of on the next poll. Deliberately does NOT depend on `argsKey` —
  // the channel is per tenant, so changing a filter must not resubscribe.
  useEffect(() => {
    if (isSkipped || !tenantId || !isRefRealtimeBacked(refName)) return;

    const { channelName, binding } = buildOrderSubscription(
      tenantId,
      instanceKeyRef.current
    );

    const channel = supabase
      .channel(channelName)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        binding,
        (payload: OrderChangePayload) => {
          // The server-side filter should already have excluded other tenants;
          // this is the second line of defence before we act on the row. Only
          // one filter clause per binding is allowed and it is spent on the
          // tenant, so the BRANCH check has nowhere else to happen — without it
          // a manager's queue refetches, and the chime fires, for a sale at
          // another branch.
          if (!isOrderChangeInScope(payload, tenantId, scope)) return;
          reloadRef.current();
        }
      )
      .subscribe((status: string) => {
        setRealtimeStatus(resolveRealtimeStatus(status));
      });

    return () => {
      // Back to the fast poll while unsubscribed, so a tenant switch or sign-out
      // never leaves a screen on the slow interval with no live channel.
      setRealtimeStatus("disconnected");
      void supabase.removeChannel(channel);
    };
  }, [refName, tenantId, isSkipped, scopeKey, scope]);

  return { data, isLoading: isSkipped ? false : isLoading, error, isMissingFunction: false };
}
