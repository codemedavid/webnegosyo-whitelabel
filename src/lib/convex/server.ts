interface ConvexServerClient {
  mutation<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>;
  query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>;
  action<T = unknown>(path: string, args: Record<string, unknown>): Promise<T>;
}

export function createConvexServerClient(
  deploymentUrl: string,
  deployKey: string
): ConvexServerClient {
  async function call<T>(
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

  return {
    mutation: <T = unknown>(path: string, args: Record<string, unknown>) =>
      call<T>("mutation", path, args),
    query: <T = unknown>(path: string, args: Record<string, unknown>) =>
      call<T>("query", path, args),
    action: <T = unknown>(path: string, args: Record<string, unknown>) =>
      call<T>("action", path, args),
  };
}
