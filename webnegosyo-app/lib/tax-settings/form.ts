/**
 * Settings → Tax & discounts, as the app's form holds it.
 *
 * The form holds what the owner typed (strings, a TIN with or without its
 * branch part); the profile is what `store_tax_profiles` stores and every
 * register reads through `taxProfileFromRow`. Mirrors the web's
 * `src/lib/tax-settings/form-mapping.ts` + `form-schema.ts`, without zod (the
 * app does not ship it): every limit below is a database constraint, so a value
 * the form accepts is never refused with an unreadable error.
 */

import {
  DEFAULT_APPROVAL_THRESHOLD,
  GOV_DISCOUNT_KINDS,
  defaultTaxProfile,
  effectiveEnabledKinds,
  isMandatoryKind,
  type ApprovalRule,
  type GovDiscountKind,
  type IdPhotoMode,
  type ServiceChargeMode,
  type TaxProfile,
  type VatStatus,
} from "../gov-discount";
import { BRANCH_CODE_PATTERN, TIN_PATTERN, formatTinInput, splitTin } from "./tin";

export const TAX_TEXT_LIMITS = {
  registeredName: 160,
  businessAddress: 300,
  posMin: 40,
  posSerialNo: 60,
  posPtuNo: 60,
} as const;

/** The database caps the threshold here (`store_tax_profiles_threshold_ck`). */
export const MAX_APPROVAL_THRESHOLD = 1_000_000;

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export interface TaxSettingsForm {
  /** Null until the owner chooses: it decides the discount arithmetic. */
  vatStatus: VatStatus | null;
  registeredName: string;
  tin: string;
  tinBranchCode: string;
  businessAddress: string;
  isBirRegisteredPos: boolean;
  posMin: string;
  posSerialNo: string;
  posPtuNo: string;
  enabledKinds: GovDiscountKind[];
  allowSharedTable: boolean;
  approvalRule: ApprovalRule;
  approvalThreshold: string;
  serviceChargeMode: ServiceChargeMode;
  idPhotoMode: IdPhotoMode;
  onlineClaimsEnabled: boolean;
}

export type TaxSettingsField = keyof TaxSettingsForm;
export type TaxSettingsErrors = Partial<Record<TaxSettingsField, string>>;

/** The kinds an owner may switch; Senior and PWD are always on. */
export const OPTIONAL_GOV_KINDS: readonly GovDiscountKind[] = GOV_DISCOUNT_KINDS.filter(
  (kind) => !isMandatoryKind(kind),
);

export const MANDATORY_GOV_KINDS: readonly GovDiscountKind[] = GOV_DISCOUNT_KINDS.filter(isMandatoryKind);

/**
 * The form's starting values. A store without a profile starts from the
 * recommended defaults but WITHOUT a VAT status — the owner makes that choice
 * rather than inheriting a guess.
 */
export function formFromProfile(profile: TaxProfile | null): TaxSettingsForm {
  const source = profile ?? defaultTaxProfile("vat");
  return {
    vatStatus: profile?.vatStatus ?? null,
    registeredName: source.registeredName ?? "",
    tin: source.tin ? formatTinInput(source.tin) : "",
    tinBranchCode: source.tinBranchCode ?? "",
    businessAddress: source.businessAddress ?? "",
    isBirRegisteredPos: source.isBirRegisteredPos,
    posMin: source.posMin ?? "",
    posSerialNo: source.posSerialNo ?? "",
    posPtuNo: source.posPtuNo ?? "",
    enabledKinds: [...source.enabledKinds],
    allowSharedTable: source.allowSharedTable,
    approvalRule: source.approvalRule,
    approvalThreshold: String(source.approvalThreshold),
    serviceChargeMode: source.serviceChargeMode,
    idPhotoMode: source.idPhotoMode,
    onlineClaimsEnabled: source.onlineClaimsEnabled,
  };
}

function tooLong(value: string, max: number, label: string): string | null {
  return value.trim().length > max ? `${label} must be ${max} characters or fewer` : null;
}

function textErrors(form: TaxSettingsForm): TaxSettingsErrors {
  const checks: [TaxSettingsField, string | null][] = [
    ["registeredName", tooLong(form.registeredName, TAX_TEXT_LIMITS.registeredName, "Business name")],
    ["businessAddress", tooLong(form.businessAddress, TAX_TEXT_LIMITS.businessAddress, "Address")],
    ["posMin", tooLong(form.posMin, TAX_TEXT_LIMITS.posMin, "MIN")],
    ["posSerialNo", tooLong(form.posSerialNo, TAX_TEXT_LIMITS.posSerialNo, "Serial number")],
    ["posPtuNo", tooLong(form.posPtuNo, TAX_TEXT_LIMITS.posPtuNo, "PTU number")],
  ];
  return Object.fromEntries(checks.filter(([, message]) => message !== null)) as TaxSettingsErrors;
}

function tinErrors(form: TaxSettingsForm): TaxSettingsErrors {
  const tin = form.tin.trim();
  const branch = form.tinBranchCode.trim();
  if (tin !== "" && !TIN_PATTERN.test(tin)) {
    return { tin: "Enter your TIN like 123-456-789 or 123-456-789-00000" };
  }
  if (branch !== "" && !BRANCH_CODE_PATTERN.test(branch)) {
    return { tinBranchCode: "The branch code is 3 to 5 digits, like 000 or 00000" };
  }
  const typedBranch = tin !== "" ? splitTin(tin).branch : "";
  if (typedBranch && branch && typedBranch !== branch) {
    return { tinBranchCode: `Your TIN already ends in branch ${typedBranch}. Clear one of them.` };
  }
  return {};
}

function posErrors(form: TaxSettingsForm): TaxSettingsErrors {
  if (!form.isBirRegisteredPos) return {};
  return {
    ...(form.posMin.trim() === "" ? { posMin: "Enter the MIN from your Permit To Use" } : {}),
    ...(form.posPtuNo.trim() === "" ? { posPtuNo: "Enter your PTU number" } : {}),
  };
}

function thresholdErrors(form: TaxSettingsForm): TaxSettingsErrors {
  if (form.approvalRule !== "above") return {};
  const raw = form.approvalThreshold.trim();
  const amount = Number(raw);
  const isValid = MONEY_PATTERN.test(raw) && amount > 0 && amount <= MAX_APPROVAL_THRESHOLD;
  return isValid ? {} : { approvalThreshold: "Enter an amount in pesos, like 500" };
}

/** Every problem, one message per field. Empty when the form can be saved. */
export function validateTaxSettingsForm(form: TaxSettingsForm): TaxSettingsErrors {
  return {
    ...(form.vatStatus === null ? { vatStatus: "Choose VAT-registered or Non-VAT" } : {}),
    ...textErrors(form),
    ...tinErrors(form),
    ...posErrors(form),
    ...thresholdErrors(form),
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toThreshold(raw: string): number {
  const amount = Number(raw.trim());
  if (raw.trim() === "" || !Number.isFinite(amount) || amount < 0) return DEFAULT_APPROVAL_THRESHOLD;
  return Math.round(amount * 100) / 100;
}

/**
 * A validated form → the profile to store. Null while no VAT status is chosen.
 * A branch code typed after the TIN moves into its own column, so the receipt
 * header never prints it twice (`tinHeaderLine` appends the branch code).
 */
export function profileFromForm(form: TaxSettingsForm): TaxProfile | null {
  if (form.vatStatus === null) return null;
  const { base, branch } = splitTin(form.tin);
  return {
    vatStatus: form.vatStatus,
    registeredName: orNull(form.registeredName),
    tin: orNull(base),
    tinBranchCode: orNull(branch) ?? orNull(form.tinBranchCode),
    businessAddress: orNull(form.businessAddress),
    isBirRegisteredPos: form.isBirRegisteredPos,
    posMin: orNull(form.posMin),
    posSerialNo: orNull(form.posSerialNo),
    posPtuNo: orNull(form.posPtuNo),
    enabledKinds: effectiveEnabledKinds(form.enabledKinds),
    allowSharedTable: form.allowSharedTable,
    approvalRule: form.approvalRule,
    approvalThreshold: toThreshold(form.approvalThreshold),
    serviceChargeMode: form.serviceChargeMode,
    idPhotoMode: form.idPhotoMode,
    onlineClaimsEnabled: form.onlineClaimsEnabled,
  };
}

/** Switches one optional kind on or off, keeping the mandatory ones. */
export function toggleKind(
  kinds: readonly GovDiscountKind[],
  kind: GovDiscountKind,
  isOn: boolean,
): GovDiscountKind[] {
  if (isMandatoryKind(kind)) return effectiveEnabledKinds(kinds);
  const rest = kinds.filter((existing) => existing !== kind);
  return effectiveEnabledKinds(isOn ? [...rest, kind] : rest);
}

/** Whether anything differs from the values the screen loaded. */
export function isFormDirty(form: TaxSettingsForm, loaded: TaxSettingsForm): boolean {
  return JSON.stringify(form) !== JSON.stringify(loaded);
}
