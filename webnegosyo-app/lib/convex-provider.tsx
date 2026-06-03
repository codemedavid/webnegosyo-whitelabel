import React, { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useAuthStore } from "../stores/auth-store";

interface ConvexAuthProviderProps {
  children: React.ReactNode;
}

export function ConvexAuthProvider({ children }: ConvexAuthProviderProps) {
  const convexUrl = useAuthStore((s) => s.convexUrl);

  const client = useMemo(() => {
    if (!convexUrl) return null;
    // A malformed or unreachable convex_deployment_url must never crash the
    // whole app — this provider wraps the entire navigation tree, so a throw
    // here white-screens the app right after login. Degrade gracefully instead.
    try {
      return new ConvexReactClient(convexUrl, {
        unsavedChangesWarning: false,
      });
    } catch (e) {
      console.warn("Failed to initialize Convex client:", e);
      return null;
    }
  }, [convexUrl]);

  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexProvider client={client}>
      {children}
    </ConvexProvider>
  );
}
