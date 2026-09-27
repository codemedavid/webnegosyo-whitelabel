/**
 * The voucher editor's form.
 *
 * Text boxes hold text, so amounts and limits live here as strings until the
 * merchant saves. `formToDraft` turns them into the `VoucherDraft` that the
 * shared validator judges — the same `admin-validation.ts` the web admin and
 * its server action use, copied verbatim — and `validateVoucherForm` adds the
 * few checks that only exist because a phone keyboard can type things a web
 * number input cannot, or because the database is stricter than the draft.
 *
 * Pure: the screen owns the state, this module owns the rules.
 */

import {
  normalizeVoucherCode,
  validateVoucherDraft,
  type VoucherDraft,
  type VoucherIssue,
} from "../vouchers/admin-validation";
import type {
  Voucher,
  VoucherChannel,
  VoucherDiscountType,
  VoucherScope,
} from "../vouchers/types";

export interface VoucherForm {
  code: string;
  name: string;
  discountType: VoucherDiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minOrderAmount: string;
  scope: VoucherScope;
  targetIds: string[];
  isStackable: boolean;
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
  /** ISO timestamps, or null for "from now" / "no end". */
  startsAt: string | null;
  endsAt: string | null;
  channels: VoucherChannel[];
}

export interface VoucherFormValidation {
  errors: VoucherIssue[];
  warnings: VoucherIssue[];
}

export const ALL_CHANNELS: readonly VoucherChannel[] = ["checkout", "pos", "admin"];

export const DISCOUNT_TYPE_OPTIONS: readonly { value: VoucherDiscountType; label: string; hint: string }[] = [
  { value: "percent", label: "% off", hint: "A percentage off the order" },
  { value: "fixed", label: "₱ off", hint: "A fixed peso amount off" },
  { value: "free_delivery", label: "Free delivery", hint: "Waives the delivery fee" },
];

export const SCOPE_OPTIONS: readonly { value: VoucherScope; label: string }[] = [
  { value: "universal", label: "Whole order" },
  { value: "products", label: "Products" },
  { value: "categories", label: "Categories" },
];

export const CHANNEL_OPTIONS: readonly { value: VoucherChannel; label: string }[] = [
  { value: "checkout", label: "Online checkout" },
  { value: "pos", label: "Counter (POS)" },
  { value: "admin", label: "Admin orders" },
];

/** One-tap amounts: the discounts shops actually run. */
export const QUICK_VALUES: Readonly<Record<Exclude<VoucherDiscountType, "free_delivery">, readonly number[]>> = {
  percent: [5, 10, 15, 20, 50],
  fixed: [20, 50, 100, 200],
};

export const END_PRESETS: readonly { label: string; days: number }[] = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

/** Long enough for LAUNCHWEEK20, short enough to read out at a counter. */
export const MAX_CODE_LENGTH = 20;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RANDOM_TAIL_LENGTH = 2;
const MAX_NAME_STEM = 8;
const FALLBACK_STEM = "SAVE";
const FREE_DELIVERY_CODE = "FREEDEL";

/** A fresh form for a new voucher, or a saved voucher's values as text. */
export function buildVoucherForm(voucher: Voucher | null): VoucherForm {
  if (!voucher) {
    return {
      code: "",
      name: "",
      discountType: "percent",
      discountValue: "",
      maxDiscountAmount: "",
      minOrderAmount: "",
      scope: "universal",
      targetIds: [],
      isStackable: false,
      usageLimitTotal: "",
      usageLimitPerCustomer: "",
      startsAt: null,
      endsAt: null,
      channels: [...ALL_CHANNELS],
    };
  }

  return {
    code: voucher.code,
    name: voucher.name,
    discountType: voucher.discountType,
    discountValue: voucher.discountType === "free_delivery" ? "" : numberText(voucher.discountValue),
    maxDiscountAmount: numberText(voucher.maxDiscountAmount),
    // No minimum is stored as 0; showing "0" invites the merchant to wonder
    // whether they set one.
    minOrderAmount: voucher.minOrderAmount ? numberText(voucher.minOrderAmount) : "",
    scope: voucher.scope,
    targetIds: [...(voucher.targetIds ?? [])],
    isStackable: voucher.isStackable,
    usageLimitTotal: numberText(voucher.usageLimitTotal),
    usageLimitPerCustomer: numberText(voucher.usageLimitPerCustomer),
    startsAt: voucher.startsAt ?? null,
    endsAt: voucher.endsAt ?? null,
    channels: [...voucher.channels],
  };
}

function numberText(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/** "₱1,500" → 1500; "" → null; anything unreadable → NaN. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Unreadable optional numbers go to the shared validator as absent; `localIssues` names them. */
function optionalAmount(text: string): number | null {
  const value = parseAmount(text);
  return value === null || Number.isNaN(value) ? null : value;
}

export function formToDraft(form: VoucherForm): VoucherDraft {
  const isFreeDelivery = form.discountType === "free_delivery";
  // Free delivery waives the fee and never looks at items, so a scope would
  // only produce a "choose a product" error for a choice that does nothing.
  const scope: VoucherScope = isFreeDelivery ? "universal" : form.scope;
  const discountValue = isFreeDelivery ? 0 : parseAmount(form.discountValue) ?? 0;

  return {
    code: normalizeVoucherCode(form.code),
    name: form.name,
    discountType: form.discountType,
    discountValue,
    maxDiscountAmount: form.discountType === "percent" ? optionalAmount(form.maxDiscountAmount) : null,
    minOrderAmount: optionalAmount(form.minOrderAmount),
    scope,
    targetIds: scope === "universal" ? [] : [...form.targetIds],
    isStackable: form.isStackable,
    usageLimitTotal: optionalAmount(form.usageLimitTotal),
    usageLimitPerCustomer: optionalAmount(form.usageLimitPerCustomer),
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    channels: [...form.channels],
  };
}

/**
 * The shared rules, then the ones the database adds: `usage_limit_*` and
 * `max_discount_amount` must be above zero (a 0 would be refused by a CHECK
 * constraint with a message no merchant can read), limits are integers, and
 * text in a number box is an error rather than a silent "unlimited".
 */
export function validateVoucherForm(form: VoucherForm): VoucherFormValidation {
  const draft = formToDraft(form);
  const shared = validateVoucherDraft(draft);
  return {
    errors: [...shared.errors, ...localIssues(form, draft)],
    warnings: [...shared.warnings],
  };
}

function localIssues(form: VoucherForm, draft: VoucherDraft): VoucherIssue[] {
  const issues: VoucherIssue[] = [];
  const checks: { field: keyof VoucherForm; isWhole: boolean; mustBePositive: string | null; applies: boolean }[] = [
    {
      field: "maxDiscountAmount",
      isWhole: false,
      mustBePositive: "Leave blank for no cap, or enter more than zero.",
      applies: draft.discountType === "percent",
    },
    { field: "minOrderAmount", isWhole: false, mustBePositive: null, applies: true },
    {
      field: "usageLimitTotal",
      isWhole: true,
      mustBePositive: "Leave blank for unlimited, or enter 1 or more.",
      applies: true,
    },
    {
      field: "usageLimitPerCustomer",
      isWhole: true,
      mustBePositive: "Leave blank for unlimited, or enter 1 or more.",
      applies: true,
    },
  ];

  for (const check of checks) {
    if (!check.applies) continue;
    const value = parseAmount(form[check.field] as string);
    if (value === null || value < 0) continue; // blank is fine; negatives are the shared rule's
    if (Number.isNaN(value)) {
      issues.push({ field: check.field, message: "Enter a number." });
    } else if (value === 0 && check.mustBePositive) {
      issues.push({ field: check.field, message: check.mustBePositive });
    } else if (check.isWhole && !Number.isInteger(value)) {
      issues.push({ field: check.field, message: "Use a whole number." });
    }
  }
  return issues;
}

/** A voucher built from the form as typed so far, for the live ticket preview. */
export function formToPreview(form: VoucherForm, saved: Voucher | null): Voucher {
  const draft = formToDraft(form);
  const value = Number.isFinite(draft.discountValue) ? draft.discountValue : 0;
  return {
    id: saved?.id ?? "preview",
    code: draft.code,
    name: draft.name.trim(),
    discountType: draft.discountType,
    discountValue: value,
    maxDiscountAmount: draft.maxDiscountAmount ?? null,
    minOrderAmount: draft.minOrderAmount ?? 0,
    scope: draft.scope,
    targetIds: draft.targetIds,
    isStackable: draft.isStackable,
    usageLimitTotal: draft.usageLimitTotal ?? null,
    usageLimitPerCustomer: draft.usageLimitPerCustomer ?? null,
    usedCount: saved?.usedCount ?? 0,
    startsAt: draft.startsAt ?? null,
    endsAt: draft.endsAt ?? null,
    channels: draft.channels ?? ALL_CHANNELS,
    outletIds: saved?.outletIds ?? null,
    isActive: saved?.isActive ?? true,
  };
}

/**
 * A code built from what the merchant already typed: the name's first word
 * plus the value ("Launch week", 20% → LAUNCH20). If that is already the code,
 * a random tail makes the next tap produce something new.
 */
export function suggestVoucherCode(form: VoucherForm, random: () => number = Math.random): string {
  const suggestion = baseSuggestion(form);
  if (normalizeVoucherCode(form.code) !== suggestion) return suggestion;
  const tail = Array.from(
    { length: RANDOM_TAIL_LENGTH },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join("");
  return `${suggestion}${tail}`.slice(0, MAX_CODE_LENGTH);
}

function baseSuggestion(form: VoucherForm): string {
  if (form.discountType === "free_delivery") return FREE_DELIVERY_CODE;
  const firstWord = form.name.trim().split(/\s+/)[0] ?? "";
  const stem = firstWord.replace(/[^a-z]/gi, "").toUpperCase().slice(0, MAX_NAME_STEM) || FALLBACK_STEM;
  const value = parseAmount(form.discountValue);
  const suffix = value !== null && Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "";
  return `${stem}${suffix}`.slice(0, MAX_CODE_LENGTH);
}

/** The first moment of that local day: a code that "starts Oct 5" works all of Oct 5. */
export function startOfDayIso(day: Date): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).toISOString();
}

/** The last moment of that local day: a code that "ends Oct 5" still works that evening. */
export function endOfDayIso(day: Date): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).toISOString();
}

export function endPresetIso(days: number, now: Date): string {
  return endOfDayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

export function isFormDirty(initial: VoucherForm, current: VoucherForm): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

/** The first message for a field, for the inline error under its box. */
export function issueFor(issues: readonly VoucherIssue[], field: string): string | null {
  return issues.find((issue) => issue.field === field)?.message ?? null;
}

export interface VoucherTemplate {
  id: string;
  title: string;
  hint: string;
}

/**
 * Starting points for a merchant who has never written a voucher. Each fills
 * the form with a sensible promotion; nothing is saved until they tap Create,
 * and every field stays editable.
 */
export const VOUCHER_TEMPLATES: readonly VoucherTemplate[] = [
  { id: "welcome", title: "Welcome discount", hint: "10% off, once per customer" },
  { id: "free-delivery", title: "Free delivery", hint: "On orders of ₱500 or more" },
  { id: "peso-off", title: "₱50 off", hint: "On orders of ₱300 or more" },
  { id: "flash", title: "Weekend flash sale", hint: "15% off, ends in a week" },
];

const WEEK_DAYS = 7;

/** The form a template fills in, or null for an unknown id (a stale deep link). */
export function formFromTemplate(templateId: string, now: Date): VoucherForm | null {
  const blank = buildVoucherForm(null);
  switch (templateId) {
    case "welcome":
      return { ...blank, code: "WELCOME10", name: "Welcome discount", discountValue: "10", usageLimitPerCustomer: "1" };
    case "free-delivery":
      return {
        ...blank,
        code: "FREEDEL",
        name: "Free delivery",
        discountType: "free_delivery",
        minOrderAmount: "500",
        channels: ["checkout"],
      };
    case "peso-off":
      return { ...blank, code: "SAVE50", name: "₱50 off", discountType: "fixed", discountValue: "50", minOrderAmount: "300" };
    case "flash":
      return {
        ...blank,
        code: "FLASH15",
        name: "Weekend flash sale",
        discountValue: "15",
        maxDiscountAmount: "150",
        endsAt: endPresetIso(WEEK_DAYS, now),
      };
    default:
      return null;
  }
}
