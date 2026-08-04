import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "./supabase";
import { isStaleBundleError } from "./stale-backend";
import { resolveRefRoute } from "./backends/route";
import {
  runPlatformQuery,
  runPlatformMutation,
  type PlatformClient,
} from "./backends/supabase-adapter";
import {
  buildOrderSubscription,
  isOrderChangeInScope,
  isRefRealtimeBacked,
  resolvePollMs,
  resolveRealtimeStatus,
  type OrderChangePayload,
  type RealtimeStatus,
} from "./backends/supabase-realtime";
import { useAccountBranchScope } from "./use-branch-scope";
import { convexOrderQueryArgs } from "./convex-order-scope";
import type { BranchScope } from "./branch-scope";

interface SafeQueryResult<T> {
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

// A tenant's Convex deployment can lag the app (older bundle). Besides a flat-out
// missing function, that shows up as validator/argument drift. Treat all of these
// as a recoverable "this store needs a backend update" state rather than a hard
// error, so screens show their missing-section placeholder instead of an error.
// The write path (the register) reads the same markers — see stale-backend.ts.
const MISSING_FN_MARKER = "Could not find public function";

const LOADING_TIMEOUT_MS = 15000; // 15 seconds

const platformClient = supabase as unknown as PlatformClient;

/**
 * Distinguishes concurrent subscribers on the same tenant so their realtime
 * channels do not collide. Module-scoped counter rather than a random id so it
 * stays deterministic and readable in the Supabase dashboard.
 */
let channelInstanceCounter = 0;

/** The tenant in scope — the impersonated store when a superadmin is inside one. */
function useScopedTenantId(): string | null {
  const tenantId = useAuthStore((s) => s.tenantId);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  return impersonatedTenantId ?? tenantId;
}

/**
 * Fetch a function ref from the platform Supabase adapter.
 *
 * Always called (never behind a condition) so the hook order stays identical on
 * every render regardless of which backend a tenant uses; it simply does
 * nothing when `tenantId` is null.
 */
function usePlatformQuery<T>(
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

    let isCurrent = true;

    const load = async () => {
      try {
        const result = await runPlatformQuery(
          platformClient,
          tenantId,
          refName,
          JSON.parse(argsKey),
          scope
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
  }, [refName, argsKey, tenantId, isSkipped, realtimeStatus, scopeKey, scope]);

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

export function useSafeQuery<T>(
  ref: FunctionReference<"query">,
  args?: Record<string, unknown> | "skip"
): SafeQueryResult<T> {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const convexSchemaVersion = useAuthStore((s) => s.convexSchemaVersion);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const tenantId = useScopedTenantId();
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  /**
   * The branch this ACCOUNT may see — deliberately not `useBranchScope`, which
   * is already narrowed to the branch an owner has drilled into.
   *
   * Fetching through the narrowed scope would leave the portfolio and the
   * Branches comparison unable to read the branches they exist to compare, and
   * an owner may see the whole store regardless, so the drill-down stays a
   * client-side narrowing. What the account is confined to is a different
   * matter: pushing that into the query is the only thing that stops a
   * manager's device receiving rows it may not see.
   */
  const accountScope = useAccountBranchScope();

  // Screens address their backend by string ref, so the ref doubles as its name.
  const refName = String(ref);
  const route = resolveRefRoute({ orderBackend, convexUrl, tenantId, ref: refName });

  const platformResult = usePlatformQuery<T>(
    refName,
    args,
    route === "platform" ? tenantId : null,
    accountScope
  );

  // Convex stays untouched for every tenant that routes to it; a platform
  // tenant skips it so no request is made against a deployment it does not have.
  //
  // A branch-scoped account additionally asks Convex to narrow the order reads,
  // so other branches' rows never cross the wire. Only for such an account: a
  // deployment on an older bundle rejects the unknown argument and the screen
  // would show "needs a backend update" instead of the orders.
  const queryArgs =
    route !== "convex" || !convexUrl
      ? "skip"
      : convexOrderQueryArgs(refName, args, accountScope, convexSchemaVersion);

  let result: T | undefined;
  let hookError: string | null = null;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    result = useQuery(ref, queryArgs) as T | undefined;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    hookError = msg;
    if (!isStaleBundleError(msg)) {
      console.error("[useSafeQuery] Convex error:", msg);
    }
  }

  // Track loading timeout
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    // Reset on new query
    startTimeRef.current = Date.now();
    setTimedOut(false);
    setError(null);
  }, [convexUrl, ref]);

  useEffect(() => {
    if (result !== undefined || hookError || !convexUrl) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [result, hookError, convexUrl]);

  // Determine final state
  if (route === "platform") return platformResult;

  if (route === "idle") {
    // No tenant in scope yet — keep the screen in its loading state rather than
    // claiming an empty result.
    return { data: undefined, isLoading: true, error: null, isMissingFunction: false };
  }

  if (route === "unsupported") {
    // This backend genuinely cannot answer. Reporting it as a missing function
    // makes the screen show its "needs a backend update" placeholder, which is
    // honest; empty data would read as "you have none of these".
    return {
      data: undefined,
      isLoading: false,
      error: MISSING_FN_MARKER,
      isMissingFunction: true,
    };
  }

  if (!convexUrl) {
    return { data: undefined, isLoading: false, error: "Convex not configured", isMissingFunction: false };
  }

  if (hookError) {
    return {
      data: undefined,
      isLoading: false,
      error: hookError,
      isMissingFunction: isStaleBundleError(hookError),
    };
  }

  if (timedOut && result === undefined) {
    return {
      data: undefined,
      isLoading: false,
      error: "Query timed out. Check that Convex is deployed and functions exist.",
      isMissingFunction: false,
    };
  }

  return {
    data: result,
    isLoading: result === undefined,
    error: error,
    isMissingFunction: false,
  };
}

/**
 * Callers pass backend-specific argument objects (POS carts, status patches),
 * so the parameter stays open here and is validated by whichever backend runs.
 */
type SafeMutation = (args?: unknown) => Promise<unknown>;

export function useSafeMutation(ref: FunctionReference<"mutation">): SafeMutation {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const tenantId = useScopedTenantId();

  // As in `useSafeQuery`: the account's branch, not the one being viewed. An
  // owner drilled into North must still be able to act on a South order they
  // opened from the portfolio.
  const accountScope = useAccountBranchScope();

  const refName = String(ref);
  const route = resolveRefRoute({ orderBackend, convexUrl, tenantId, ref: refName });

  // Called unconditionally to keep the hook order stable across backends.
  const platformMutate = useCallback<SafeMutation>(
    async (args) => {
      if (!tenantId) throw new Error("No store selected");
      return runPlatformMutation(
        platformClient,
        tenantId,
        refName,
        args ?? {},
        accountScope
      );
    },
    [refName, tenantId, accountScope]
  );

  let convexMutate: SafeMutation | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    convexMutate = useMutation(ref) as unknown as SafeMutation;
  } catch {
    convexMutate = null;
  }

  if (route === "platform") return platformMutate;

  if (convexMutate) return convexMutate;

  if (!convexUrl) {
    return async () => {
      throw new Error("Convex not connected");
    };
  }
  throw new Error("Convex mutation error");
}

export function useSafeAction(ref: FunctionReference<"action">) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAction(ref);
  } catch {
    return async () => {
      throw new Error(convexUrl ? "Convex action error" : "Convex not connected");
    };
  }
}
