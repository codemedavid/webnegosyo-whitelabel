import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "./supabase";
import { resolveRefRoute } from "./backends/route";
import {
  runPlatformQuery,
  runPlatformMutation,
  type PlatformClient,
} from "./backends/supabase-adapter";

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

const MISSING_FN_MARKER = "Could not find public function";

// A tenant's Convex deployment can lag the app (older bundle). Besides a flat-out
// missing function, that shows up as validator/argument drift. Treat all of these
// as a recoverable "this store needs a backend update" state rather than a hard
// error, so screens show their missing-section placeholder instead of an error.
const STALE_BUNDLE_MARKERS = [
  MISSING_FN_MARKER,
  "ArgumentValidationError",
  "is not in the validator",
];

function isStaleBundleError(msg: string): boolean {
  return STALE_BUNDLE_MARKERS.some((m) => msg.includes(m));
}

const LOADING_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Convex pushes updates; Postgres does not. Until the realtime subscription
 * lands, platform-backed screens re-read on this interval so a new order still
 * appears without the merchant pulling to refresh.
 */
const PLATFORM_POLL_MS = 15000;

const platformClient = supabase as unknown as PlatformClient;

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
  tenantId: string | null
): SafeQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Screens pass fresh object literals every render, so the object identity
  // changes constantly. Key the effect on the serialized args instead, or the
  // fetch loops forever.
  const argsKey = JSON.stringify(args ?? {});
  const isSkipped = args === "skip" || !tenantId;

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
          JSON.parse(argsKey)
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

    load();
    const timer = setInterval(load, PLATFORM_POLL_MS);

    return () => {
      isCurrent = false;
      clearInterval(timer);
    };
  }, [refName, argsKey, tenantId, isSkipped]);

  return { data, isLoading: isSkipped ? false : isLoading, error, isMissingFunction: false };
}

export function useSafeQuery<T>(
  ref: FunctionReference<"query">,
  args?: Record<string, unknown> | "skip"
): SafeQueryResult<T> {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const tenantId = useScopedTenantId();
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Screens address their backend by string ref, so the ref doubles as its name.
  const refName = String(ref);
  const route = resolveRefRoute({ orderBackend, convexUrl, tenantId, ref: refName });

  const platformResult = usePlatformQuery<T>(
    refName,
    args,
    route === "platform" ? tenantId : null
  );

  // Convex stays untouched for every tenant that routes to it; a platform
  // tenant skips it so no request is made against a deployment it does not have.
  const queryArgs = route !== "convex" || !convexUrl ? "skip" : (args ?? {});

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

  const refName = String(ref);
  const route = resolveRefRoute({ orderBackend, convexUrl, tenantId, ref: refName });

  // Called unconditionally to keep the hook order stable across backends.
  const platformMutate = useCallback<SafeMutation>(
    async (args) => {
      if (!tenantId) throw new Error("No store selected");
      return runPlatformMutation(platformClient, tenantId, refName, args ?? {});
    },
    [refName, tenantId]
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
