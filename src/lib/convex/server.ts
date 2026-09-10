interface ConvexServerClient {
  mutation<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>;
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>;
  action<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>;
}

/**
 * Convex answers "function not found" for an internal function called
 * without admin credentials AND for a function that does not exist yet.
 * The server always sends the deploy key, so here it can only mean the
 * deployment still runs a template older than v28, where the `*Internal`
 * variants do not exist and the public names were still open.
 */
const NOT_FOUND = /Could not find (public )?function/;
const INTERNAL_SUFFIX = "Internal";

export function publicFallbackPath(path: string): string | null {
  if (!path.endsWith(INTERNAL_SUFFIX)) return null;
  return path.slice(0, -INTERNAL_SUFFIX.length);
}

export function createConvexServerClient(
  deploymentUrl: string,
  deployKey: string
): ConvexServerClient {
  async function post<T>(
    type: "mutation" | "query" | "action",
    path: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${deploymentUrl}/api/${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${deployKey}`,
      },
      body: JSON.stringify({ path, args, format: "json" }),
    });

    const data = await response.json();

    if (data.status === "error") {
      throw new Error(data.errorMessage ?? "Convex call failed");
    }

    return data.value as T;
  }

  /**
   * Server code calls the `*Internal` variants, which only admin credentials
   * reach. Until every store's deployment is on v28 the variant may not exist
   * there yet; fall back to the public name once, so the rollout order
   * (web first, then deployments) cannot take order tracking down.
   */
  async function call<T>(
    type: "mutation" | "query" | "action",
    path: string,
    args: Record<string, unknown>
  ): Promise<T> {
    try {
      return await post<T>(type, path, args);
    } catch (error) {
      const fallback = publicFallbackPath(path);
      if (!fallback || !(error instanceof Error) || !NOT_FOUND.test(error.message)) {
        throw error;
      }
      return post<T>(type, fallback, args);
    }
  }

  return {
    mutation: <T = unknown>(path: string, args: Record<string, unknown>) =>
      call<T>("mutation", path, args),
    query: <T = unknown>(path: string, args: Record<string, unknown>) =>
      call<T>("query", path, args),
    action: <T = unknown>(path: string, args: Record<string, unknown>) =>
      call<T>("action", path, args),
  };
}
