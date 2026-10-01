/**
 * Which wallets need to hear about a card, given what it shows now and what
 * each one was last told. Pure, so the "never push a card that did not change"
 * rule is pinned by tests rather than by reading the route.
 *
 * Each wallet keeps its own watermark: a customer who downloads the pass
 * refreshes `content_hash` on the way, but their OTHER devices were never
 * pushed — the Apple watermark still says so.
 */

export interface PassSyncState {
  /** Hash of the card as rendered right now. */
  hash: string
  contentHash: string | null
  applePushedHash: string | null
  /** Null until the member asks for a Google pass — no Google call before then. */
  googleSyncedHash: string | null
  isAppleConfigured: boolean
  isGoogleConfigured: boolean
  appleDeviceCount: number
}

export interface PassSyncPlan {
  recordContent: boolean
  pushApple: boolean
  patchGoogle: boolean
}

export function planPassSync(state: PassSyncState): PassSyncPlan {
  return {
    recordContent: state.hash !== state.contentHash,
    pushApple: state.isAppleConfigured && state.appleDeviceCount > 0 && state.hash !== state.applePushedHash,
    patchGoogle: state.isGoogleConfigured && state.googleSyncedHash !== null && state.hash !== state.googleSyncedHash,
  }
}
