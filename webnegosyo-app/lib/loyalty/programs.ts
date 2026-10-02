/**
 * Pure helpers for the Rewards screen: the program shape the platform returns,
 * how a program is described on a card, and how the setup form becomes rules.
 * No I/O, so the `logic` Jest project covers every branch.
 */

export type LoyaltyEarnMode = "stamp" | "points";
export type LoyaltyProgramStatus = "draft" | "active" | "paused" | "ended";

/** `emoji` / `imageUrl` only decorate the card; redemption never reads them. */
export type LoyaltyReward =
  | { type: "fixed"; amount: number; emoji?: string | null }
  | { type: "percent"; percent: number; maxAmount?: number | null; emoji?: string | null }
  | { type: "free_item"; menuItemId: string; itemName: string; imageUrl?: string | null; emoji?: string | null };

/** A reward part-way along the card; only the top reward resets it. */
export interface LoyaltyMilestone {
  at: number;
  reward: LoyaltyReward;
}

export interface LoyaltyRules {
  earnMode: LoyaltyEarnMode;
  threshold: number;
  pointsPerPeso: number | null;
  minSpend: number | null;
  reward: LoyaltyReward;
  milestones?: LoyaltyMilestone[];
  rewardExpiryDays: number | null;
  isExclusive: boolean;
}

export interface LoyaltyProgramSummary {
  id: string;
  name: string;
  description: string | null;
  earnMode: LoyaltyEarnMode;
  scope: "business" | "branch";
  outletId: string | null;
  status: LoyaltyProgramStatus;
  activatesAt: string | null;
  endsAt: string | null;
  versionNumber: number | null;
  rules: LoyaltyRules | null;
  members: number;
  rewardsOutstanding: number;
  createdAt: string;
}

export interface LoyaltyFlags {
  isEnabled: boolean;
  isShadow: boolean;
}

function pesos(amount: number): string {
  return `₱${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

export function describeReward(reward: LoyaltyReward): string {
  switch (reward.type) {
    case "fixed":
      return `${pesos(reward.amount)} off`;
    case "percent":
      return reward.maxAmount ? `${reward.percent}% off (up to ${pesos(reward.maxAmount)})` : `${reward.percent}% off`;
    case "free_item":
      return `Free ${reward.itemName}`;
  }
}

/** "Every 10 orders → ₱50 off" / "Every 500 points (1 pt per ₱) → 10% off". */
export function describeProgramRules(rules: LoyaltyRules | null): string {
  if (!rules) return "Rules not set";
  const earning =
    rules.earnMode === "stamp"
      ? `Every ${rules.threshold} order${rules.threshold === 1 ? "" : "s"}`
      : `Every ${rules.threshold} points (${rules.pointsPerPeso ?? 0} pt per ₱)`;
  const minimum = rules.minSpend ? `, orders of ${pesos(rules.minSpend)}+` : "";
  const extra = rules.milestones?.length ?? 0;
  const ladder = extra ? ` (+${extra} reward${extra === 1 ? "" : "s"} on the way)` : "";
  return `${earning}${minimum} → ${describeReward(rules.reward)}${ladder}`;
}

/** One rung on the card as the merchant and the customer see it. */
export interface RewardStep {
  at: number;
  label: string;
  emoji: string;
  imageUrl: string | null;
  isFinal: boolean;
}

const TYPE_EMOJI: Record<LoyaltyReward["type"], string> = { free_item: "🎁", fixed: "💸", percent: "🏷️" };

export function rewardEmoji(reward: LoyaltyReward): string {
  return reward.emoji?.trim() || TYPE_EMOJI[reward.type];
}

function toStep(at: number, reward: LoyaltyReward, isFinal: boolean): RewardStep {
  return {
    at,
    label: describeReward(reward),
    emoji: rewardEmoji(reward),
    imageUrl: reward.type === "free_item" ? reward.imageUrl ?? null : null,
    isFinal,
  };
}

/** Same ladder the web draws (`src/lib/loyalty/ladder.ts`): lowest rung first, the reset last. */
export function rewardSteps(rules: LoyaltyRules): RewardStep[] {
  const middle = (rules.milestones ?? [])
    .filter(milestone => milestone.at > 0 && milestone.at < rules.threshold)
    .sort((a, b) => a.at - b.at)
    .map(milestone => toStep(milestone.at, milestone.reward, false));
  return [...middle, toStep(rules.threshold, rules.reward, true)];
}

export const STATUS_LABELS: Record<LoyaltyProgramStatus, string> = {
  draft: "Draft",
  active: "Live",
  paused: "Paused",
  ended: "Ended",
};

/** The one action a card offers for each state, if any. */
export function nextStatusAction(
  status: LoyaltyProgramStatus,
): { label: string; to: "active" | "paused" | "ended" } | null {
  switch (status) {
    case "draft":
      return { label: "Activate", to: "active" };
    case "active":
      return { label: "Pause", to: "paused" };
    case "paused":
      return { label: "Resume", to: "active" };
    case "ended":
      return null;
  }
}

/** One reward being edited. Strings, because they come off text inputs. */
export interface RewardDraft {
  type: "fixed" | "percent" | "free_item";
  value: string;
  cap: string;
  itemId: string;
  itemName: string;
  imageUrl: string;
  emoji: string;
}

export const EMPTY_REWARD: RewardDraft = {
  type: "free_item", value: "", cap: "", itemId: "", itemName: "", imageUrl: "", emoji: "",
};

export interface MilestoneDraft {
  at: number;
  reward: RewardDraft;
}

/** What the setup form collects. */
export interface ProgramForm {
  name: string;
  earnMode: LoyaltyEarnMode;
  threshold: string;
  pointsPerPeso: string;
  minSpend: string;
  scope: "business" | "branch";
  outletId: string;
  /** The top reward, on the last slot. */
  reward: RewardDraft;
  /** Rewards on the way, keyed by the stamp they sit on. */
  milestones: MilestoneDraft[];
  rewardExpiryDays: string;
  activatesAt: string;
  endsAt: string;
}

export const EMPTY_FORM: ProgramForm = {
  name: "",
  earnMode: "stamp",
  threshold: "10",
  pointsPerPeso: "1",
  minSpend: "",
  scope: "business",
  outletId: "",
  reward: EMPTY_REWARD,
  milestones: [],
  rewardExpiryDays: "",
  activatesAt: "",
  endsAt: "",
};

export type ProgramInput = { name: string; scope: "business" | "branch"; outletId?: string; activatesAt?: string; endsAt?: string; rules: LoyaltyRules };
export type FormParse =
  | { ok: true; program: ProgramInput }
  | { ok: false; error: string };

function positive(value: string): number | null {
  const number = Number(value.trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function optional(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

type RewardParse = { ok: true; reward: LoyaltyReward } | { ok: false; error: string };

/** A draft into platform terms, with the same refusals `parseLoyaltyRules` makes. */
export function parseRewardDraft(draft: RewardDraft): RewardParse {
  const emoji = draft.emoji.trim();
  const look = emoji ? { emoji } : {};
  if (draft.type === "free_item") {
    if (!draft.itemId || !draft.itemName.trim()) return { ok: false, error: "Choose the free menu item." };
    const imageUrl = draft.imageUrl.startsWith("https://") ? { imageUrl: draft.imageUrl } : {};
    return { ok: true, reward: { type: "free_item", menuItemId: draft.itemId, itemName: draft.itemName.trim(), ...imageUrl, ...look } };
  }
  const value = positive(draft.value);
  if (!value) return { ok: false, error: "What is the reward worth?" };
  if (draft.type === "fixed") return { ok: true, reward: { type: "fixed", amount: value, ...look } };
  if (value > 100) return { ok: false, error: "A percent reward cannot exceed 100%." };
  const cap = optional(draft.cap);
  if (cap === undefined) return { ok: false, error: "The cap must be a positive amount." };
  return { ok: true, reward: { type: "percent", percent: value, maxAmount: cap || null, ...look } };
}

export function rewardToDraft(reward: LoyaltyReward): RewardDraft {
  return {
    type: reward.type,
    value: reward.type === "fixed" ? String(reward.amount) : reward.type === "percent" ? String(reward.percent) : "",
    cap: reward.type === "percent" && reward.maxAmount != null ? String(reward.maxAmount) : "",
    itemId: reward.type === "free_item" ? reward.menuItemId : "",
    itemName: reward.type === "free_item" ? reward.itemName : "",
    imageUrl: reward.type === "free_item" ? reward.imageUrl ?? "" : "",
    emoji: reward.emoji ?? "",
  };
}

/**
 * Same refusals the platform makes (`parseLoyaltyRules`), so the merchant sees
 * the problem on the form rather than in a failed request.
 */
export function parseProgramForm(form: ProgramForm): FormParse {
  const dates: { activatesAt?: string; endsAt?: string } = {};
  for (const field of ["activatesAt", "endsAt"] as const) {
    const value = form[field].trim();
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00+08:00`))) return { ok: false, error: "Use dates in YYYY-MM-DD format." };
    dates[field] = new Date(`${value}T00:00:00+08:00`).toISOString();
  }
  if (dates.activatesAt && dates.endsAt && dates.endsAt <= dates.activatesAt) return { ok: false, error: "The end must be after activation." };
  const name = form.name.trim();
  if (!name) return { ok: false, error: "Give the program a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  if (form.scope === "branch" && !form.outletId) return { ok: false, error: "Choose a branch." };

  const threshold = positive(form.threshold);
  if (!threshold) return { ok: false, error: "How many orders or points earn a reward?" };
  if (form.earnMode === "stamp" && !Number.isInteger(threshold)) return { ok: false, error: "Orders per reward must be a whole number." };

  const pointsPerPeso = form.earnMode === "points" ? positive(form.pointsPerPeso) : null;
  if (form.earnMode === "points" && !pointsPerPeso) {
    return { ok: false, error: "How many points does each peso earn?" };
  }

  const minSpend = optional(form.minSpend);
  if (minSpend === undefined) return { ok: false, error: "Minimum spend must be a positive amount." };

  const top = parseRewardDraft(form.reward);
  if (!top.ok) return { ok: false, error: `Big reward: ${top.error}` };

  const unit = form.earnMode === "stamp" ? "stamp" : "point";
  const milestones: LoyaltyMilestone[] = [];
  for (const milestone of [...form.milestones].sort((a, b) => a.at - b.at)) {
    if (!(milestone.at > 0) || milestone.at >= threshold) return { ok: false, error: `The reward at ${unit} ${milestone.at} is past the end of the card.` };
    const parsed = parseRewardDraft(milestone.reward);
    if (!parsed.ok) return { ok: false, error: `Reward at ${unit} ${milestone.at}: ${parsed.error}` };
    milestones.push({ at: milestone.at, reward: parsed.reward });
  }
  if (milestones.length > MAX_MILESTONES) return { ok: false, error: `A card holds at most ${MAX_MILESTONES + 1} rewards.` };

  const expiry = optional(form.rewardExpiryDays);
  if (expiry === undefined || (expiry !== null && (!Number.isInteger(expiry) || expiry < 1))) return { ok: false, error: "Reward expiry must be a whole number of days above zero, or blank." };

  return {
    ok: true,
    program: {
      name,
      ...dates,
      scope: form.scope,
      ...(form.scope === "branch" ? { outletId: form.outletId } : {}),
      rules: {
        earnMode: form.earnMode,
        threshold,
        pointsPerPeso,
        minSpend: minSpend || null,
        reward: top.reward,
        ...(milestones.length ? { milestones } : {}),
        rewardExpiryDays: expiry,
        isExclusive: true,
      },
    },
  };
}

/** Mirrors `MAX_LOYALTY_MILESTONES` on the platform. */
export const MAX_MILESTONES = 4;

/** Existing rules are loaded in full; editing never resets hidden reward terms. */
export function programToForm(program: LoyaltyProgramSummary): ProgramForm {
  const rules = program.rules;
  if (!rules) return { ...EMPTY_FORM, name: program.name, earnMode: program.earnMode, scope: program.scope, outletId: program.outletId ?? "" };
  return {
    ...EMPTY_FORM,
    name: program.name, earnMode: rules.earnMode, scope: program.scope, outletId: program.outletId ?? "",
    threshold: String(rules.threshold), pointsPerPeso: String(rules.pointsPerPeso ?? 1),
    minSpend: rules.minSpend == null ? "" : String(rules.minSpend),
    reward: rewardToDraft(rules.reward),
    milestones: (rules.milestones ?? []).map(milestone => ({ at: milestone.at, reward: rewardToDraft(milestone.reward) })),
    rewardExpiryDays: rules.rewardExpiryDays == null ? "" : String(rules.rewardExpiryDays),
  };
}
