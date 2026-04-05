"use client";

import React, { createContext, useContext } from "react";
import { SafeConvexProvider } from "@/components/shared/safe-convex-provider";
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

  return (
    <SafeConvexProvider url={convexUrl}>
      <AnalyticsInner>{children}</AnalyticsInner>
    </SafeConvexProvider>
  );
}
