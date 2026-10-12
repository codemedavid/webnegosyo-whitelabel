/**
 * The device's Senior/PWD ledger queue, on AsyncStorage and the cashier's own
 * session token. Loaded lazily by its callers, like every other post-sale
 * notifier, so logic tests never pull in the native modules behind it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { postAuthorized } from "../authorized-post";
import type { RecordGovDiscountRequest } from "../gov-discount";
import { createGovLedgerQueue, type GovLedgerQueue } from "./ledger-queue";

let queue: GovLedgerQueue | null = null;

export function liveGovLedger(): GovLedgerQueue {
  queue ??= createGovLedgerQueue(AsyncStorage, (path, body) => postAuthorized(path, body));
  return queue;
}

/**
 * Save the record, then try to send it (and anything older still waiting).
 * Never throws: the sale is already done.
 */
export async function recordGovGrant(request: RecordGovDiscountRequest): Promise<void> {
  try {
    const ledger = liveGovLedger();
    await ledger.enqueue(request);
    await ledger.flush();
  } catch {
    // Kept on the device by `enqueue`; the next flush retries it.
  }
}
