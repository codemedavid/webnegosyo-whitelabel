/** Safe merchant activity contract; never carries claim tokens or OTP values. */
export const LOYALTY_ACTIVITY_KINDS = [
  'earn', 'reverse', 'redeem', 'correction', 'reward_issued', 'reward_reserved',
  'reward_consumed', 'reward_restored', 'reward_expired', 'reward_voided', 'reward_snapshot',
] as const
export type LoyaltyActivityKind = typeof LOYALTY_ACTIVITY_KINDS[number]
export interface LoyaltyActivityEvent {
  id: string
  kind: LoyaltyActivityKind
  occurredAt: string
  customerKey: string
  programId: string
  programName: string
  delta: number | null
  rewardId: string | null
  rewardLabel: string | null
  previousStatus: string | null
  status: string | null
  orderBackend: string | null
  orderId: string | null
  outletId: string | null
  actorId: string | null
  actorName?: string | null
  note: string | null
}
export interface LoyaltyActivityPage {
  events: LoyaltyActivityEvent[]
  nextCursor: string | null
}
export const LOYALTY_ACTIVITY_LABELS: Record<LoyaltyActivityKind, string> = {
  earn: 'Stamps or points earned', reverse: 'Earning reversed', redeem: 'Balance redeemed',
  correction: 'Balance adjusted', reward_issued: 'Reward unlocked', reward_reserved: 'Reward reserved',
  reward_consumed: 'Reward used', reward_restored: 'Reward restored', reward_expired: 'Reward expired',
  reward_voided: 'Reward cancelled', reward_snapshot: 'Existing reward record',
}
