import { useEffect, useState } from "react";

import type { ApprovalIntent } from "./push-route";

interface PendingIntent {
  approvalId: string;
  intent: ApprovalIntent;
  /** Distinguishes two pushes for the same request. */
  at: number;
}

export interface PushIntent {
  intent: ApprovalIntent | null;
  /** When the push was taken; part of the review's key so a new push starts fresh. */
  at: number | null;
}

const NO_INTENT: PushIntent = { intent: null, at: null };

/**
 * A push's Approve / Decline intent for the review screen, consumed ONCE.
 *
 * The screen stays mounted between requests, so the intent is remembered only
 * while the request it was sent for stays open: opening any other request
 * forgets it. Without that, A (push, Undo) → B → A from the inbox would
 * re-arm A's Approve countdown with no tap. `clearParam` must be stable.
 */
export function usePushIntent(
  approvalId: string | null,
  intentParam: ApprovalIntent | null,
  clearParam: () => void,
): PushIntent {
  const [pending, setPending] = useState<PendingIntent | null>(null);

  useEffect(() => {
    setPending((current) => (current && current.approvalId !== approvalId ? null : current));
  }, [approvalId]);

  useEffect(() => {
    if (!intentParam || !approvalId) return;
    setPending({ approvalId, intent: intentParam, at: Date.now() });
    clearParam();
  }, [intentParam, approvalId, clearParam]);

  if (!pending || pending.approvalId !== approvalId) return NO_INTENT;
  return { intent: pending.intent, at: pending.at };
}
