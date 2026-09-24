/**
 * What a member is, and how the two member screens read one out loud.
 *
 * The shapes mirror `src/lib/loyalty/members.ts` and
 * `src/lib/loyalty/member-repository.ts` — the app is a separately bundled
 * deployment and cannot import from `src/`, the same deliberate duplication
 * `programs.ts` carries. The RANKING is not duplicated: the platform ranks and
 * this screen renders the order it was given, so the app and the web admin can
 * never disagree about who is closest to a reward.
 *
 * Pure — no supabase, no fetch — so it runs under the node Jest project and
 * the screens can be reasoned about without a network. The transport lives in
 * `members-repo.ts`.
 */

export type LoyaltyMemberStatus =
  | "reward_ready"
  | "almost_there"
  | "dormant"
  | "new"
  | "earning";

export interface LoyaltyMemberProgress {
  programId: string;
  programName: string;
  programStatus: "draft" | "active" | "paused" | "ended";
  earnMode: "stamp" | "points";
  threshold: number;
  rewardLabel: string;
  balance: number;
  lifetimeEarned: number;
  rewardsIssued: number;
  rewardsAvailable: number;
  lastActivityAt: string | null;
  remaining: number | null;
  percent: number | null;
  isDormant: boolean;
}

export interface LoyaltyMember {
  customerKey: string;
  customerId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  programs: LoyaltyMemberProgress[];
  headline: LoyaltyMemberProgress | null;
  status: LoyaltyMemberStatus;
  isDormant: boolean;
  rewardsAvailable: number;
  lastActivityAt: string | null;
}

export interface LoyaltyMemberTotals {
  total: number;
  rewardReady: number;
  almostThere: number;
  earning: number;
  new: number;
  dormant: number;
  rewardsAvailable: number;
}

export interface LoyaltyMemberReward {
  id: string;
  programId: string;
  programName: string;
  label: string;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  resolutionNote: string | null;
  isReserved: boolean;
}

export interface LoyaltyLedgerEntry {
  id: string;
  programId: string;
  programName: string;
  kind: string;
  delta: number;
  isShadow: boolean;
  note: string | null;
  orderRef: string | null;
  createdAt: string;
}

export interface LoyaltyMemberOrder {
  id: string;
  backend: "platform_supabase" | "convex" | "tenant_supabase";
  reference: string;
  total: number;
  orderedAt: string;
  channel: string | null;
  status: string | null;
  paymentStatus: string | null;
  address: string | null;
  items: Array<{ name: string; quantity: number }>;
}

export interface LoyaltyMemberProfile {
  customerId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  orderCount: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  smsConsent: boolean;
  smsOptOut: boolean;
  notes: string | null;
}

export interface LoyaltyMemberDetail {
  member: LoyaltyMember;
  profile: LoyaltyMemberProfile | null;
  rewards: LoyaltyMemberReward[];
  history: LoyaltyLedgerEntry[];
  orders: LoyaltyMemberOrder[];
  addresses: string[];
}

const STATUS_COPY: Record<LoyaltyMemberStatus, { label: string; hint: string; tone: Tone }> = {
  reward_ready: { label: "Reward ready", hint: "Has a reward waiting to be used", tone: "success" },
  almost_there: { label: "Almost there", hint: "A few visits from the next reward", tone: "accent" },
  dormant: { label: "Gone quiet", hint: "No visit in a while — worth a nudge", tone: "warning" },
  new: { label: "Just joined", hint: "First visit on the card", tone: "neutral" },
  earning: { label: "Collecting", hint: "Building up stamps", tone: "neutral" },
};

export type Tone = "success" | "accent" | "warning" | "neutral";

export function describeMemberStatus(status: LoyaltyMemberStatus): {
  label: string;
  hint: string;
  tone: Tone;
} {
  return STATUS_COPY[status] ?? STATUS_COPY.earning;
}

/** "3 more visits", "1 more visit", "Ready to claim" — never "0 more". */
export function describeRemaining(progress: LoyaltyMemberProgress | null): string {
  if (!progress) return "No card yet";
  if (progress.rewardsAvailable > 0) return "Ready to claim";
  if (progress.remaining === null) return "Progress unavailable";
  if (progress.remaining <= 0) return "Ready to claim";
  const unit = progress.earnMode === "points" ? "point" : "visit";
  return `${progress.remaining} more ${unit}${progress.remaining === 1 ? "" : "s"}`;
}

/** `9 / 10` in the program's own unit. */
export function describeBalance(progress: LoyaltyMemberProgress | null): string {
  if (!progress) return "—";
  const balance = Number.isInteger(progress.balance)
    ? String(progress.balance)
    : progress.balance.toFixed(2);
  if (progress.threshold <= 0) return balance;
  return `${balance} / ${progress.threshold}`;
}

/**
 * A fresh idempotency key for one adjustment.
 *
 * The platform refuses a replay with the same id, so this MUST be minted once
 * per intent and reused across retries — mint it when the merchant opens the
 * adjust form, not when the request fires, or a double tap becomes two ids and
 * the defence is gone.
 */
export function newAdjustmentRequestId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `adj-${Date.now().toString(36)}-${random}`;
}
