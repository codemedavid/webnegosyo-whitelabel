/**
 * Pure helpers for the Rewards screen: the program shape the platform returns,
 * how a program is described on a card, and how the setup form becomes rules.
 * No I/O, so the `logic` Jest project covers every branch.
 */

export type LoyaltyEarnMode = "stamp" | "points";
export type LoyaltyProgramStatus = "draft" | "active" | "paused" | "ended";

export type LoyaltyReward =
  | { type: "fixed"; amount: number }
  | { type: "percent"; percent: number; maxAmount?: number | null }
  | { type: "free_item"; menuItemId: string; itemName: string };

export interface LoyaltyRules {
  earnMode: LoyaltyEarnMode;
  threshold: number;
  pointsPerPeso: number | null;
  minSpend: number | null;
  reward: LoyaltyReward;
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
  return `${earning}${minimum} → ${describeReward(rules.reward)}`;
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

/** What the setup form collects. Strings, because they come off text inputs. */
export interface ProgramForm {
  name: string;
  earnMode: LoyaltyEarnMode;
  threshold: string;
  pointsPerPeso: string;
  minSpend: string;
  rewardType: "fixed" | "percent";
  rewardValue: string;
  rewardCap: string;
}

export const EMPTY_FORM: ProgramForm = {
  name: "",
  earnMode: "stamp",
  threshold: "10",
  pointsPerPeso: "1",
  minSpend: "",
  rewardType: "fixed",
  rewardValue: "",
  rewardCap: "",
};

export type FormParse =
  | { ok: true; program: { name: string; scope: "business"; rules: LoyaltyRules } }
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

/**
 * Same refusals the platform makes (`parseLoyaltyRules`), so the merchant sees
 * the problem on the form rather than in a failed request.
 */
export function parseProgramForm(form: ProgramForm): FormParse {
  const name = form.name.trim();
  if (!name) return { ok: false, error: "Give the program a name." };

  const threshold = positive(form.threshold);
  if (!threshold) return { ok: false, error: "How many orders or points earn a reward?" };

  const pointsPerPeso = form.earnMode === "points" ? positive(form.pointsPerPeso) : null;
  if (form.earnMode === "points" && !pointsPerPeso) {
    return { ok: false, error: "How many points does each peso earn?" };
  }

  const minSpend = optional(form.minSpend);
  if (minSpend === undefined) return { ok: false, error: "Minimum spend must be a positive amount." };

  const rewardValue = positive(form.rewardValue);
  if (!rewardValue) return { ok: false, error: "What is the reward worth?" };
  if (form.rewardType === "percent" && rewardValue > 100) {
    return { ok: false, error: "A percent reward cannot exceed 100%." };
  }
  const rewardCap = optional(form.rewardCap);
  if (rewardCap === undefined) return { ok: false, error: "The cap must be a positive amount." };

  const reward: LoyaltyReward =
    form.rewardType === "percent"
      ? { type: "percent", percent: rewardValue, maxAmount: rewardCap || null }
      : { type: "fixed", amount: rewardValue };

  return {
    ok: true,
    program: {
      name,
      scope: "business",
      rules: {
        earnMode: form.earnMode,
        threshold,
        pointsPerPeso,
        minSpend: minSpend || null,
        reward,
        rewardExpiryDays: null,
        isExclusive: true,
      },
    },
  };
}
