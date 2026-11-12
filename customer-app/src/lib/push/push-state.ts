/**
 * The order-updates switch and the "get a ping" card, as pure rules (P7).
 *
 * - permission: what the phone says (never asked / allowed / refused).
 * - choice:     what the customer chose in this app on this phone; 'off'
 *               wins over an allowed permission (they turned it off here).
 * - registered: the store has this install's token for the current session.
 * - canPush:    this build can get a push token at all (an EAS project id;
 *               Expo Go test builds have none).
 */
export type PushPermission = 'undetermined' | 'granted' | 'denied'
export type PushChoice = 'unset' | 'on' | 'off'

export interface PushSnapshot {
  permission: PushPermission
  choice: PushChoice
  /** The customer tapped "Not now" on the order card. */
  isAskDismissed: boolean
  canPush: boolean
}

/** The card on an order's screen: only for someone who has never been asked and never said no here. */
export function shouldShowAsk(snapshot: PushSnapshot, isMember: boolean): boolean {
  return isMember && snapshot.permission === 'undetermined' && snapshot.choice === 'unset' && !snapshot.isAskDismissed
}

/** Whether this install should be registered with the store right now. */
export function wantsRegistration(snapshot: PushSnapshot, isMember: boolean): boolean {
  return isMember && snapshot.canPush && snapshot.permission === 'granted' && snapshot.choice !== 'off'
}

export type AccountRow =
  | { kind: 'switch'; isOn: boolean; detail: string }
  | { kind: 'settings'; detail: string }
  | { kind: 'unavailable'; detail: string }

const ON_DETAIL = 'When your order is accepted, ready or cancelled'

/** Account → Notifications → Order updates. */
export function accountRow(snapshot: PushSnapshot): AccountRow {
  if (!snapshot.canPush) return { kind: 'unavailable', detail: 'Not available in this test build' }
  if (snapshot.permission === 'denied') return { kind: 'settings', detail: 'Turned off in your phone’s settings. Tap to open them.' }
  return { kind: 'switch', isOn: snapshot.permission === 'granted' && snapshot.choice !== 'off', detail: ON_DETAIL }
}
