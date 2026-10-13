/**
 * One phone, two queues: reward codes first, automated texts after.
 *
 * A reward code is someone standing at the counter waiting; it always goes
 * before a marketing text. Automated texts are asked for only when the code
 * queue is idle AND their own schedule says so (`nextOutboxAttemptAt`: a gap
 * between texts, the server's waits, back-off on trouble), so the 5-second
 * code poll never becomes a 5-second marketing poll.
 */

import type { WorkerRunResult } from "../loyalty/sms-delivery-mount";
import { nextOutboxAttemptAt, type OutboxRunResult } from "./outbox-worker";

interface Runner<T> {
  runOnce(): Promise<T>;
}

export interface CombinedSenderDeps {
  codes: Runner<WorkerRunResult>;
  texts: Runner<OutboxRunResult>;
  now(): number;
}

function asWorkerResult(outcome: OutboxRunResult): WorkerRunResult {
  return outcome.result === "waiting" ? "idle" : outcome.result;
}

export function createCombinedSender({ codes, texts, now }: CombinedSenderDeps) {
  let nextTextAt = 0;
  return {
    async runOnce(): Promise<WorkerRunResult> {
      const codeResult = await codes.runOnce();
      if (codeResult !== "idle") return codeResult;
      if (now() < nextTextAt) return "idle";
      const textResult = await texts.runOnce();
      nextTextAt = nextOutboxAttemptAt(textResult, now());
      return asWorkerResult(textResult);
    },
  };
}
