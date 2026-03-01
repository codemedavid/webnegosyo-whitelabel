import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";
import { useAuthStore } from "../stores/auth-store";

export function useSafeQuery<T>(
  ref: FunctionReference<"query">,
  args?: Record<string, unknown> | "skip"
): T | undefined {
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const queryArgs = !convexUrl ? "skip" : (args ?? {});

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQuery(ref, queryArgs) as T | undefined;
  } catch {
    return undefined;
  }
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
