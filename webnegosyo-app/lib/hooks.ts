import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";

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

const LOADING_TIMEOUT_MS = 15000; // 15 seconds

export function useSafeQuery<T>(
  ref: FunctionReference<"query">,
  args?: Record<string, unknown> | "skip"
): SafeQueryResult<T> {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const queryArgs = !convexUrl ? "skip" : (args ?? {});

  let result: T | undefined;
  let hookError: string | null = null;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    result = useQuery(ref, queryArgs) as T | undefined;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    hookError = msg;
    if (!msg.includes("Could not find public function")) {
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
  if (!convexUrl) {
    return { data: undefined, isLoading: false, error: "Convex not configured", isMissingFunction: false };
  }

  if (hookError) {
    return {
      data: undefined,
      isLoading: false,
      error: hookError,
      isMissingFunction: hookError.includes(MISSING_FN_MARKER),
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

export function useSafeMutation(ref: FunctionReference<"mutation">) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMutation(ref);
  } catch {
    if (!convexUrl) {
      return async () => {
        throw new Error("Convex not connected");
      };
    }
    throw new Error("Convex mutation error");
  }
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
