/**
 * The step-by-step "build a reward card" flow, as pure functions over
 * `ProgramForm`. Every edit returns a new form, so the screen can keep the
 * previous one for Back and the preview always draws exactly what saves.
 */

import {
  EMPTY_FORM,
  EMPTY_REWARD,
  parseProgramForm,
  parseRewardDraft,
  rewardSteps,
  type MilestoneDraft,
  type RewardStep,
  type ProgramForm,
  type RewardDraft,
  describeReward,
  rewardEmoji,
} from "./programs";

export type WizardStep = "style" | "size" | "rewards" | "details" | "review";

export const CREATE_STEPS: readonly WizardStep[] = ["style", "size", "rewards", "details", "review"];
/** Editing keeps the program's style; the name and branch are fixed after creation. */
export const EDIT_STEPS: readonly WizardStep[] = ["size", "rewards", "details", "review"];

export const STEP_TITLES: Record<WizardStep, string> = {
  style: "Pick a card style",
  size: "How long is the card?",
  rewards: "Put rewards on the card",
  details: "Final touches",
  review: "Your card",
};

/** A stamp card shorter than 2 has no journey; longer than 20 stops fitting a phone. */
export const MIN_STAMPS = 2;
export const MAX_STAMPS = 20;

/** Quick picks for a reward's icon — food first, since that is what stores give away. */
export const REWARD_EMOJIS = ["☕", "🧋", "🥤", "🍵", "🍰", "🍩", "🥐", "🍪", "🍦", "🍔", "🍕", "🍟", "🍗", "🍜", "🎁", "💸", "🏷️", "⭐"] as const;

export interface ProgramTemplate {
  id: "classic" | "ladder" | "points" | "blank";
  emoji: string;
  title: string;
  tagline: string;
  form: ProgramForm;
}

const freeItemPlaceholder = (emoji: string): RewardDraft => ({ ...EMPTY_REWARD, type: "free_item", emoji });

export const PROGRAM_TEMPLATES: readonly ProgramTemplate[] = [
  {
    id: "classic",
    emoji: "☕",
    title: "Classic stamp card",
    tagline: "Buy 9, the 10th is on us",
    form: { ...EMPTY_FORM, name: "Stamp Card", threshold: "10", reward: freeItemPlaceholder("☕") },
  },
  {
    id: "ladder",
    emoji: "🪜",
    title: "Reward ladder",
    tagline: "A small treat half way, a big one at the end",
    form: {
      ...EMPTY_FORM,
      name: "Rewards Club",
      threshold: "10",
      reward: freeItemPlaceholder("🍔"),
      milestones: [{ at: 5, reward: freeItemPlaceholder("🥤") }],
    },
  },
  {
    id: "points",
    emoji: "💎",
    title: "Points club",
    tagline: "Every peso counts toward money off",
    form: {
      ...EMPTY_FORM,
      name: "Points Club",
      earnMode: "points",
      threshold: "500",
      pointsPerPeso: "1",
      reward: { ...EMPTY_REWARD, type: "fixed", value: "100", emoji: "💸" },
      milestones: [{ at: 250, reward: { ...EMPTY_REWARD, type: "fixed", value: "30", emoji: "🏷️" } }],
    },
  },
  {
    id: "blank",
    emoji: "✨",
    title: "Start from scratch",
    tagline: "Build your own card",
    form: { ...EMPTY_FORM, reward: freeItemPlaceholder("") },
  },
];

export function applyTemplate(template: ProgramTemplate): ProgramForm {
  return {
    ...template.form,
    reward: { ...template.form.reward },
    milestones: template.form.milestones.map(milestone => ({ at: milestone.at, reward: { ...milestone.reward } })),
  };
}

function threshold(form: ProgramForm): number {
  const value = Number(form.threshold);
  return Number.isFinite(value) ? value : 0;
}

/** The reward on a slot: the big one on the last slot, a middle one, or none. */
export function rewardAt(form: ProgramForm, at: number): RewardDraft | null {
  if (at === threshold(form)) return form.reward;
  return form.milestones.find(milestone => milestone.at === at)?.reward ?? null;
}

export function placeReward(form: ProgramForm, at: number, reward: RewardDraft): ProgramForm {
  if (at === threshold(form)) return { ...form, reward };
  const others = form.milestones.filter(milestone => milestone.at !== at);
  const milestones: MilestoneDraft[] = [...others, { at, reward }].sort((a, b) => a.at - b.at);
  return { ...form, milestones };
}

/** The big reward is what the card is for; only a middle reward can be taken off. */
export function removeReward(form: ProgramForm, at: number): ProgramForm {
  if (!form.milestones.some(milestone => milestone.at === at)) return form;
  return { ...form, milestones: form.milestones.filter(milestone => milestone.at !== at) };
}

/** A shorter card loses the rewards that would sit past its new end. */
export function resizeCard(form: ProgramForm, size: number): ProgramForm {
  return {
    ...form,
    threshold: String(size),
    milestones: form.milestones.filter(milestone => milestone.at < size),
  };
}

export interface CardSlot {
  at: number;
  reward: RewardDraft | null;
  isFinal: boolean;
  isFilled: boolean;
}

/** Every slot of a stamp card, for the preview. Points cards draw a bar instead. */
export function cardSlots(form: ProgramForm, filled = 0): CardSlot[] {
  const size = Math.max(0, Math.min(MAX_STAMPS, Math.floor(threshold(form))));
  return Array.from({ length: size }, (_, index) => {
    const at = index + 1;
    return { at, reward: rewardAt(form, at), isFinal: at === size, isFilled: at <= filled };
  });
}

/** What stops the merchant leaving this step, in words they can act on. */
export function stepIssue(form: ProgramForm, step: WizardStep): string | null {
  switch (step) {
    case "style":
      return null;
    case "size": {
      const size = threshold(form);
      if (form.earnMode === "points") {
        if (!(size > 0)) return "How many points fill the card?";
        return Number(form.pointsPerPeso) > 0 ? null : "How many points does each peso earn?";
      }
      if (!Number.isInteger(size) || size < MIN_STAMPS || size > MAX_STAMPS) {
        return `A stamp card holds ${MIN_STAMPS} to ${MAX_STAMPS} stamps.`;
      }
      return null;
    }
    case "rewards": {
      const top = parseRewardDraft(form.reward);
      if (!top.ok) return `Big reward: ${top.error}`;
      const unit = form.earnMode === "stamp" ? "stamp" : "point";
      for (const milestone of form.milestones) {
        const parsed = parseRewardDraft(milestone.reward);
        if (!parsed.ok) return `Reward at ${unit} ${milestone.at}: ${parsed.error}`;
      }
      return null;
    }
    case "details":
    case "review": {
      const parsed = parseProgramForm(form);
      return parsed.ok ? null : parsed.error;
    }
  }
}

const TYPE_EMOJI: Record<RewardDraft["type"], string> = { free_item: "🎁", fixed: "💸", percent: "🏷️" };

const UNFINISHED_LABEL: Record<RewardDraft["type"], string> = {
  free_item: "Pick a menu item",
  fixed: "Set the amount off",
  percent: "Set the percent off",
};

/** One rung for the preview, finished or not — the card should never go blank mid-edit. */
function previewStep(at: number, draft: RewardDraft, isFinal: boolean): RewardStep {
  const parsed = parseRewardDraft(draft);
  if (!parsed.ok) {
    return { at, label: UNFINISHED_LABEL[draft.type], emoji: draft.emoji.trim() || TYPE_EMOJI[draft.type], imageUrl: null, isFinal };
  }
  return {
    at,
    label: describeReward(parsed.reward),
    emoji: rewardEmoji(parsed.reward),
    imageUrl: parsed.reward.type === "free_item" ? parsed.reward.imageUrl ?? null : null,
    isFinal,
  };
}

/** The ladder the preview draws from the form being edited. */
export function previewSteps(form: ProgramForm): RewardStep[] {
  const size = threshold(form);
  const middle = form.milestones
    .filter(milestone => milestone.at > 0 && milestone.at < size)
    .map(milestone => previewStep(milestone.at, milestone.reward, false));
  return [...middle, previewStep(size, form.reward, true)];
}

/** Steps for a saved program, re-exported so screens import one module. */
export { rewardSteps };
