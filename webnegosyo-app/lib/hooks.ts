import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";
import { isStaleBundleError } from "./stale-backend";
import { resolveRefRoute } from "./backends/route";
import { runPlatformMutation } from "./backends/supabase-adapter";
import {
  platformClient,
  usePlatformQuery,
  type SafeQueryResult,
} from "./backends/use-platform-query";
import { useAccountBranchScope } from "./use-branch-scope";
import { convexOrderQueryArgs } from "./convex-order-scope";

// A tenant's Convex deployment can lag the app (older bundle). Besides a flat-out
// missing function, that shows up as validator/argument drift. Treat all of these
// as a recoverable "this store needs a backend update" state rather than a hard
// error, so screens show their missing-section placeholder instead of an error.
// The write path (the register) reads the same markers — see stale-backend.ts.
const MISSING_FN_MARKER = "Could not find public function";

const LOADING_TIMEOUT_MS = 15000; // 15 seconds

/** The tenant in scope — the impersonated store when a superadmin is inside one. */
function useScopedTenantId(): string | null {
  const tenantId = useAuthStore((s) => s.tenantId);
  const impersonatedTenantId = useAuthStore((s) => s.impersonatedTenantId);
  return impersonatedTenantId ?? tenantId;
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
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const tenantId = useScopedTenantId();

  const refName = String(ref);
  const route = resolveRefRoute({ orderBackend, convexUrl, tenantId, ref: refName });

  let convexAction: ((args?: unknown) => Promise<unknown>) | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    convexAction = useAction(ref) as unknown as (args?: unknown) => Promise<unknown>;
  } catch {
    convexAction = null;
  }

  if (route === "convex" && convexAction) return convexAction;

  // The platform adapter ships no action runner: the only action with a
  // platform equivalent (Lalamove) dispatches through its own transport before
  // reaching this hook. Reporting the marker keeps callers on their existing
  // "needs a backend update" handling instead of misdiagnosing a healthy
  // platform tenant as a Convex outage.
  return async () => {
    throw new Error(MISSING_FN_MARKER);
  };
}
