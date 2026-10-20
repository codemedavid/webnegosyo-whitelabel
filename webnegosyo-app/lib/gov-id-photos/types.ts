/**
 * Optional Senior/PWD ID photos on the register.
 *
 * A photo is taken while the cashier fills in the claimant, before the order
 * has an id, so it is saved to the app's own storage and only uploaded once
 * the sales book has the grant (`photo-queue.ts`). It never blocks a sale.
 */

import type { GovLedgerBackend } from "../gov-discount";

/** A photo on this device, waiting for its sale. */
export interface CapturedIdPhoto {
  /** In the app's document directory (`gov-id-photos/`), never the camera roll. */
  fileUri: string;
  /** ISO time the photo was taken — the 90 days count from here. */
  capturedAt: string;
}

/** A photo handed to the sale's bookkeeping, keyed by the claimant it shows. */
export interface SaleIdPhoto extends CapturedIdPhoto {
  claimantRef: string;
}

/** A photo queued for upload once its order exists. */
export interface QueuedIdPhoto extends SaleIdPhoto {
  /** One per order + claimant: a retake replaces the waiting one. */
  id: string;
  tenantId: string;
  backend: GovLedgerBackend;
  externalOrderId: string;
  attempts: number;
  queuedAt: number;
}
