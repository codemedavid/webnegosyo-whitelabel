// Streaming client for the AI Growth Coach. Streams the edge function's SSE
// reply into a growing `answer` string so the UI can render it like a live
// typewriter. Uses expo/fetch (SDK 54) for real ReadableStream support — the
// Supabase JS client buffers responses and cannot stream — and authenticates
// with the merchant's own Supabase JWT. SSE parsing lives in lib/sse-parse.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { supabase, supabaseUrl, supabaseAnonKey } from "../lib/supabase";
import { parseSseChunk } from "../lib/sse-parse";
import type { GrowthCoachFacts } from "../lib/growth-coach";

const COACH_URL = `${supabaseUrl}/functions/v1/growth-coach`;

export interface UseGrowthCoachResult {
  /** Assistant text accumulated so far (grows while streaming). */
  answer: string;
  isStreaming: boolean;
  error: string | null;
  ask: (facts: GrowthCoachFacts) => Promise<void>;
  reset: () => void;
}

export function useGrowthCoach(): UseGrowthCoachResult {
  const [answer, setAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream if the screen unmounts mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnswer("");
    setError(null);
    setIsStreaming(false);
  }, []);

  const ask = useCallback(async (facts: GrowthCoachFacts) => {
    // Supersede any prior request and clear the previous answer.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnswer("");
    setError(null);
    setIsStreaming(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        throw new Error("Please sign in with a merchant account to use the coach.");
      }

      const res = await expoFetch(COACH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(facts),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `The coach is unavailable right now (${res.status}).`;
        try {
          const body = await res.json();
          if (body?.error) detail = body.error;
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        throw new Error(detail);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        // No stream available — read the whole body and parse it once.
        const text = await res.text();
        const { deltas } = parseSseChunk(text.endsWith("\n") ? text : `${text}\n`);
        setAnswer(deltas.join(""));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { deltas, rest } = parseSseChunk(buffer);
        buffer = rest;
        if (deltas.length > 0) {
          const chunk = deltas.join("");
          setAnswer((prev) => prev + chunk);
        }
      }
    } catch (e) {
      // A superseded/unmounted request aborts on purpose — stay silent.
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Could not reach the coach.");
    } finally {
      // Only the most recent request owns the streaming flag.
      if (abortRef.current === controller) {
        setIsStreaming(false);
        abortRef.current = null;
      }
    }
  }, []);

  return { answer, isStreaming, error, ask, reset };
}
