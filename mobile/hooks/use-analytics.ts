import { useMutation } from "convex/react";
import { useCallback, useRef, useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { FunctionReference } from "convex/server";

const trackEventRef = "analytics:trackEvent" as unknown as FunctionReference<"mutation">;

interface AnalyticsEvent {
  type: string;
  metadata?: Record<string, unknown>;
}

export function useAnalytics() {
  const trackEventMutation = useMutation(trackEventRef);
  const buffer = useRef<AnalyticsEvent[]>([]);
  const sessionId = useRef<string>(Math.random().toString(36).substring(2));

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
        // Silent fail for analytics
      }
    }
  }, [trackEventMutation]);

  useEffect(() => {
    const interval = setInterval(flush, 5000);
    return () => {
      clearInterval(interval);
      flush();
    };
  }, [flush]);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        flush();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [flush]);

  const trackEvent = useCallback(
    (type: string, metadata?: Record<string, unknown>) => {
      buffer.current.push({ type, metadata });
    },
    []
  );

  return { trackEvent };
}

export function useAnalyticsNoop() {
  return {
    trackEvent: (_type: string, _metadata?: Record<string, unknown>) => {},
  };
}
