/**
 * Requests whose send ended with NO answer (status 0: offline or timed out
 * after the server may already have filed — or, for a direct refund,
 * executed — it). The retry key outlives the sheet, so closing and reopening
 * it and sending the same request again replays the first one instead of
 * filing a second (a second direct refund would move money twice).
 * In memory only: an app restart starts over, and the server's one-open rule
 * and cumulative limits still bound the worst case.
 */
export interface UnsettledSend {
  key: string;
  /** draftSignature of the body sent under `key`. */
  signature: string;
}

let unsettled: ReadonlyMap<string, UnsettledSend> = new Map();

export function unsettledSendId(tenantId: string, orderId: string, kind: string): string {
  return `${tenantId}:${orderId}:${kind}`;
}

export function readUnsettledSend(id: string): UnsettledSend | null {
  return unsettled.get(id) ?? null;
}

export function rememberUnsettledSend(id: string, send: UnsettledSend): void {
  unsettled = new Map([...unsettled, [id, send]]);
}

export function forgetUnsettledSend(id: string): void {
  if (!unsettled.has(id)) return;
  unsettled = new Map([...unsettled].filter(([key]) => key !== id));
}

/** Tests and sign-out. */
export function clearUnsettledSends(): void {
  unsettled = new Map();
}
