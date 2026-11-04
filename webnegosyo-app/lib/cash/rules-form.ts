/**
 * The Shift & remit rules screen's decisions, kept pure so they are tested
 * without a renderer: the business-day chips, the "Other" stepper, the
 * confirmation sentence, the pending change, the save dock's change list and
 * who can receive cash.
 */

import { canManageCash } from "../cash-drawers";
import { hasPermission, isTabAllowed } from "../staff-permissions";
import { CUTOFF_STEP_MINUTES, MAX_CUTOFF_MINUTES, type CutoffChange, type CutoffSchedule } from "../business-day/trading-day";
import {
  VARIANCE_REASON_MAX_CENTS,
  VARIANCE_REASON_STEP_CENTS,
  type CashRuleKey,
  type CashSettings,
  type CashSettingsPatch,
  type RemittanceMode,
} from "./settings";

const HOUR = 60;
/** 12 AM through 6 AM: where every store that trades past midnight lands. */
export const CUTOFF_CHIPS: readonly number[] = [0, 1, 2, 3, 4, 5, 6].map((h) => h * HOUR);

export function cutoffChipLabel(minutes: number): string {
  const hour = Math.floor(minutes / HOUR);
  return `${hour === 0 ? 12 : hour} AM`;
}

export function isChipCutoff(minutes: number): boolean {
  return CUTOFF_CHIPS.includes(minutes);
}

export function stepCutoff(minutes: number, direction: 1 | -1): number {
  return Math.min(MAX_CUTOFF_MINUTES, Math.max(0, minutes + direction * CUTOFF_STEP_MINUTES));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** 'YYYY-MM-DD' → "Saturday, Oct 25" (calendar arithmetic only; no time zone involved). */
export function formatDayKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** The confirmation under the setting, from the date the server returned. */
export function describeStartsFrom(effectiveFrom: string): string {
  return `Starts from ${formatDayKey(effectiveFrom)}. Past days keep their dates.`;
}

/** A saved change whose first day has not started yet, if any. */
export function pendingCutoff(schedule: CutoffSchedule, todayKey: string): CutoffChange | null {
  return schedule.find((change) => change.effectiveFrom > todayKey) ?? null;
}

export function stepThreshold(cents: number, direction: 1 | -1): number {
  return Math.min(VARIANCE_REASON_MAX_CENTS, Math.max(0, cents + direction * VARIANCE_REASON_STEP_CENTS));
}

export const REMITTANCE_MODE_OPTIONS: readonly { value: RemittanceMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Cashiers count and end the shift. Nobody accepts the cash in the app." },
  { value: "optional", label: "Optional", hint: "Cashiers can hand the cash to someone, who accepts it in the app." },
  { value: "required", label: "Required", hint: "Every shift ends with a remittance to someone who accepts it." },
];

const pesos = (cents: number): string => `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const onOff = (value: boolean): string => (value ? "On" : "Off");
const modeLabel = (mode: RemittanceMode): string => REMITTANCE_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;

/** The rules the screen edits, the words for each, and how its value reads. */
const RULE_WORDS: readonly { key: CashRuleKey; label: string; show: (value: never) => string }[] = [
  { key: "requireDenominations", label: "Count bills at end of shift", show: (v: boolean) => (v ? "Required" : "Optional") },
  { key: "blindClose", label: "Blind count", show: onOff },
  { key: "varianceReasonFromCents", label: "Ask for a reason above", show: pesos },
  { key: "remittanceMode", label: "Remittances", show: modeLabel },
  { key: "requireShiftToSell", label: "Require a shift to sell", show: onOff },
];

export interface RuleChange {
  key: CashRuleKey;
  label: string;
  from: string;
  to: string;
}

export function diffCashRules(saved: CashSettings, draft: CashSettings): RuleChange[] {
  const changed = RULE_WORDS.filter((rule) => saved[rule.key] !== draft[rule.key]);
  const order: CashRuleKey[] = ["blindClose", "requireDenominations", "varianceReasonFromCents", "remittanceMode", "requireShiftToSell"];
  return [...changed]
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((rule) => ({
      key: rule.key,
      label: rule.label,
      from: rule.show(saved[rule.key] as never),
      to: rule.show(draft[rule.key] as never),
    }));
}

export function changeSentence(change: RuleChange): string {
  return `${change.label}: ${change.from} → ${change.to}`;
}

export function rulesPatch(saved: CashSettings, draft: CashSettings): CashSettingsPatch {
  return Object.fromEntries(diffCashRules(saved, draft).map((change) => [change.key, draft[change.key]])) as CashSettingsPatch;
}

export interface StaffLike {
  userId: string;
  isOwner: boolean;
  permissions: string[] | null;
  displayName: string | null;
  outletId: string | null;
}

/**
 * Who can accept remittances and pickups: the owner and every account that
 * manages cash (the same rule as the database's `app_user_manages_cash`).
 * Read-only on this screen; Team is where it changes.
 */
export function receiversOf<T extends StaffLike>(staff: readonly T[]): T[] {
  const receivers = staff.filter((member) =>
    canManageCash({ role: "admin", isOwner: member.isOwner, permissions: member.permissions }),
  );
  return [...receivers].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
}

export interface CashRulesViewer {
  role: string | null;
  isOwner: boolean;
  permissions: string[] | null;
  /** Set = a branch-locked account. */
  outletId: string | null;
  isDemo: boolean;
}

export interface CashRulesAccess {
  canOpen: boolean;
  /** Counting, short & over, remittances, selling, named shifts: `cash_manage`. */
  canEditRules: boolean;
  /** When the business day ends: owner or `settings` — it moves every report (07 §5.4). */
  canEditCutoff: boolean;
}

/**
 * Who sees Shift & remit rules and what they may change. The rules are
 * store-wide, so a branch-locked account never gets the screen; demo reads it
 * but changes nothing. The screen opens for either key (TAB_ANY_OF
 * "cash-rules"); each section re-checks its own and the RPCs refuse the other.
 */
export function cashRulesAccess(viewer: CashRulesViewer): CashRulesAccess {
  const canOpen = viewer.outletId === null && isTabAllowed(viewer, "cash-rules");
  const canWrite = canOpen && !viewer.isDemo;
  return {
    canOpen,
    canEditRules: canWrite && canManageCash(viewer),
    canEditCutoff: canWrite && hasPermission(viewer, "settings"),
  };
}
