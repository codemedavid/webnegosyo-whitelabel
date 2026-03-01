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
    return new ConvexReactClient(convexUrl, {
      unsavedChangesWarning: false,
    });
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
