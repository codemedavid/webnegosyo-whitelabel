"use client";

import React, { createContext, useContext } from "react";
import { ConvexProvider } from "convex/react";
import { getConvexClient } from "@/lib/convex/client";
import { useAnalytics } from "@/hooks/use-analytics";

interface AnalyticsContextValue {
  trackEvent: (type: string, metadata?: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  trackEvent: () => {},
});

export function useAnalyticsContext() {
  return useContext(AnalyticsContext);
}

function AnalyticsInner({ children }: { children: React.ReactNode }) {
  const analytics = useAnalytics();
  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
}

interface AnalyticsProviderProps {
  convexUrl: string | null;
  children: React.ReactNode;
}

export function AnalyticsProvider({ convexUrl, children }: AnalyticsProviderProps) {
  if (!convexUrl) {
    return (
      <AnalyticsContext.Provider value={{ trackEvent: () => {} }}>
        {children}
      </AnalyticsContext.Provider>
    );
  }

  const client = getConvexClient(convexUrl);

  return (
    <ConvexProvider client={client}>
      <AnalyticsInner>{children}</AnalyticsInner>
    </ConvexProvider>
  );
}
