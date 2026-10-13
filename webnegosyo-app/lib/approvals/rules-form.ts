/**
 * The owner's approval rules screen (design-spec §3.10) as pure decisions:
 * each rule as a sentence with one editable value, preset steps, the bounds
 * the server's rulesUpdateSchema enforces, and what a save says changed.
 */
import { firstName, formatPesoShort } from "./state";
import type { ApprovalRules } from "./types";

export type NumericRuleKey =
  | "directRefundCap"
  | "managerApproveCap"
  | "discountPctNeedsApproval"
  | "writeoffCostNeedsApproval"
  | "expiryMinutes"
  | "maxPendingPerStaff";

export type RuleUnit = "peso" | "percent" | "minutes" | "count";

export interface RuleField {
  key: NumericRuleKey;
  /** Sentence before the value. */
  prefix: string;
  /** Sentence after the value. */
  suffix: string;
  /** Muted second line, when the rule needs one. */
  note?: string;
  /** For the "what changed" summary. */
  label: string;
  unit: RuleUnit;
  step: number;
  min: number;
  max: number;
  /** The server wants a whole number. */
  isWhole: boolean;
}

const MAX_PESOS = 1_000_000;

export const RULE_FIELDS: readonly RuleField[] = [
  {
    key: "directRefundCap",
    prefix: "Staff with Refunds can refund up to",
    suffix: "without asking.",
    label: "Staff refund limit",
    unit: "peso",
    step: 100,
    min: 0,
    max: MAX_PESOS,
    isWhole: false,
  },
  {
    key: "managerApproveCap",
    prefix: "People who can approve can say yes up to",
    suffix: "Bigger ones come to you.",
    label: "Approver limit",
    unit: "peso",
    step: 500,
    min: 0,
    max: MAX_PESOS,
    isWhole: false,
  },
  {
    key: "discountPctNeedsApproval",
    prefix: "Discounts over",
    suffix: "need approval.",
    note: "Senior & PWD discounts never do.",
    label: "Discounts needing approval",
    unit: "percent",
    step: 5,
    min: 0,
    max: 100,
    isWhole: false,
  },
  {
    key: "writeoffCostNeedsApproval",
    prefix: "Write-offs over",
    suffix: "at cost need approval.",
    label: "Write-offs needing approval",
    unit: "peso",
    step: 100,
    min: 0,
    max: MAX_PESOS,
    isWhole: false,
  },
  {
    key: "expiryMinutes",
    prefix: "Requests close after",
    suffix: "if nobody answers.",
    label: "Requests close after",
    unit: "minutes",
    step: 5,
    min: 5,
    max: 240,
    isWhole: true,
  },
  {
    key: "maxPendingPerStaff",
    prefix: "Each person can have",
    suffix: "requests waiting at a time.",
    label: "Requests waiting per person",
    unit: "count",
    step: 1,
    min: 1,
    max: 20,
    isWhole: true,
  },
];

export function formatRuleValue(field: Pick<RuleField, "unit">, value: number): string {
  switch (field.unit) {
    case "peso":
      return formatPesoShort(value);
    case "percent":
      return `${value}%`;
    case "minutes":
      return `${value} min`;
    case "count":
      return String(value);
  }
}

const clamp = (field: RuleField, value: number): number => Math.min(field.max, Math.max(field.min, value));

/** One preset jump: up to the next step, or down to the previous one. */
export function stepRule(field: RuleField, value: number, direction: 1 | -1): number {
  const next = direction === 1 ? Math.floor(value / field.step + 1e-9) * field.step + field.step : Math.ceil(value / field.step - 1e-9) * field.step - field.step;
  return clamp(field, next);
}

/** A typed value, or null when it is not a number or outside the server's bounds. */
export function parseRuleText(field: RuleField, text: string): number | null {
  const parsed = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  const value = field.isWhole ? Math.round(parsed) : Math.round(parsed * 100) / 100;
  return value < field.min || value > field.max ? null : value;
}

export type RulesPatch = Partial<Omit<ApprovalRules, "updatedAt" | "updatedByName">>;

export function rulesPatch(before: ApprovalRules, after: ApprovalRules): RulesPatch {
  const numeric = RULE_FIELDS.filter((rule) => before[rule.key] !== after[rule.key]).map((rule) => [rule.key, after[rule.key]] as const);
  return {
    ...Object.fromEntries(numeric),
    ...(before.staffRefundWindow !== after.staffRefundWindow ? { staffRefundWindow: after.staffRefundWindow } : {}),
  };
}

export interface RuleChange {
  label: string;
  from: string;
  to: string;
}

const WINDOW_LABEL: Readonly<Record<ApprovalRules["staffRefundWindow"], string>> = {
  same_day: "same day only",
  any: "any day",
};

export function diffRules(before: ApprovalRules, after: ApprovalRules): RuleChange[] {
  const numeric = RULE_FIELDS.filter((rule) => before[rule.key] !== after[rule.key]).map((rule) => ({
    label: rule.label,
    from: formatRuleValue(rule, before[rule.key]),
    to: formatRuleValue(rule, after[rule.key]),
  }));
  const window =
    before.staffRefundWindow !== after.staffRefundWindow
      ? [{ label: "Staff refunds", from: WINDOW_LABEL[before.staffRefundWindow], to: WINDOW_LABEL[after.staffRefundWindow] }]
      : [];
  return [...numeric, ...window];
}

export function changeSentence(change: RuleChange): string {
  return `${change.label}: ${change.from} → ${change.to}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "Changes are recorded in Activity. Last changed by Lorna, 12 Oct." */
export function lastChangedLine(rules: ApprovalRules): string {
  const base = "Changes are recorded in Activity.";
  if (!rules.updatedAt || !rules.updatedByName) return base;
  const at = new Date(Date.parse(rules.updatedAt) + MANILA_OFFSET_MS);
  return `${base} Last changed by ${firstName(rules.updatedByName)}, ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}.`;
}
