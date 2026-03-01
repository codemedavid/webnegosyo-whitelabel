import React, { useMemo } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

interface ConvexAppProviderProps {
  convexUrl: string | null;
  children: React.ReactNode;
}

export function ConvexAppProvider({ convexUrl, children }: ConvexAppProviderProps) {
  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl, {
      unsavedChangesWarning: false,
    });
  }, [convexUrl]);

  if (!client) {
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
