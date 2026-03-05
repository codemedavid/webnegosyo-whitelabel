"use client";

import { useMutation } from "convex/react";
import { useCallback, useRef, useEffect } from "react";
import { FunctionReference } from "convex/server";

const trackEventRef = "analytics:trackEvent" as unknown as FunctionReference<"mutation">;

interface AnalyticsEvent {
  type: string;
  metadata?: Record<string, unknown>;
}

export function useAnalytics() {
  const trackEventMutation = useMutation(trackEventRef);
  const buffer = useRef<AnalyticsEvent[]>([]);
  const sessionId = useRef<string>("");

  // Generate session ID on mount
  useEffect(() => {
    sessionId.current = crypto.randomUUID();
  }, []);

  const flush = useCallback(async () => {
    const events = buffer.current.splice(0);
    for (const event of events) {
      try {
        await trackEventMutation({
          type: event.type,
          metadata: event.metadata,
          sessionId: sessionId.current,
        });
      } catch {
        // Silent fail for analytics — don't break the app
      }
    }
  }, [trackEventMutation]);

  // Flush every 5 seconds
  useEffect(() => {
    const interval = setInterval(flush, 5000);
    return () => {
      clearInterval(interval);
      flush();
    };
  }, [flush]);

  const trackEvent = useCallback(
    (type: string, metadata?: Record<string, unknown>) => {
      buffer.current.push({ type, metadata });
    },
    []
  );

  return { trackEvent };
}

// No-op version for when Convex is not available
export function useAnalyticsNoop() {
  const trackEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_type: string, _metadata?: Record<string, unknown>) => {
      // No-op
    },
    []
  );

  return { trackEvent };
}
