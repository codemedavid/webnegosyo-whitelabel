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

  /**
   * Sends the whole buffer at once.
   *
   * `allSettled`, not a loop of awaits: these are independent one-way events,
   * and awaiting each in turn meant a customer who browsed ten items paid ten
   * sequential round-trips per flush — with one slow mutation stalling every
   * event queued behind it. Rejections are swallowed per event for the same
   * reason they always were: analytics must never break the storefront.
   */
  const flush = useCallback(async () => {
    const events = buffer.current.splice(0);
    if (events.length === 0) return;

    await Promise.allSettled(
      events.map((event) =>
        trackEventMutation({
          type: event.type,
          metadata: event.metadata,
          sessionId: sessionId.current,
        })
      )
    );
  }, [trackEventMutation]);

  // Held in a ref so the interval below is created once and is not torn down
  // and re-armed — flushing the buffer early each time — whenever the Convex
  // mutation reference changes identity.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Flush every 5 seconds, and once more on the way out so the last events of
  // a session are not dropped.
  useEffect(() => {
    const interval = setInterval(() => void flushRef.current(), 5000);
    return () => {
      clearInterval(interval);
      void flushRef.current();
    };
  }, []);

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
