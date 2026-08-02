/**
 * Rendering a campaign template into one guest's message, and telling the
 * merchant honestly what it will cost to send.
 *
 * The renderer is the same `{{placeholder}}` shape as the `sms/` reference app,
 * with one deliberate difference: an unknown placeholder is a hard error rather
 * than a blank. A marketing SMS reading "Hi , we miss you" goes to hundreds of
 * strangers before anyone notices, so the campaign editor refuses to save it
 * (`validateTemplate`) and the send loop refuses to send it.
 *
 * `countSmsSegments` exists because SMS billing is a cliff, not a slope. One
 * curly apostrophe pasted from a phone keyboard flips the whole message to
 * UCS-2 and drops the per-part limit from 160 characters to 70 — the merchant
 * pays triple for a message that looks identical on screen.
 */

import type { SmsCustomer } from "./types";

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Used when a customer row carries no usable name; never leave the greeting blank. */
export const MISSING_NAME_FALLBACK = "there";

/** Manila is UTC+8 year round — no DST has ever applied, so a fixed offset is exact. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** GSM 03.38 basic set — one septet each. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** GSM 03.38 extension set — two septets each (an ESC plus the character). */
const GSM_EXTENDED = "^{}\\[~]|€";

const GSM_BASIC_SET = new Set(GSM_BASIC);
const GSM_EXTENDED_SET = new Set(GSM_EXTENDED);

const GSM_SINGLE_LIMIT = 160;
const GSM_MULTIPART_LIMIT = 153;
const UCS2_SINGLE_LIMIT = 70;
const UCS2_MULTIPART_LIMIT = 67;

export class TemplateVariableError extends Error {
  readonly missingVariables: string[];

  constructor(missingVariables: string[]) {
    super(`Unknown message variables: ${missingVariables.join(", ")}`);
    this.name = "TemplateVariableError";
    this.missingVariables = missingVariables;
  }
}

export interface TemplateStoreContext {
  storeName: string;
}

/** "Jul 2, 2026" in Manila local time — the merchant's clock, not UTC. */
function formatManilaDate(isoTimestamp: string): string {
  const instant = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(instant)) return "";
  const local = new Date(instant + MANILA_OFFSET_MS);
  return `${MONTH_NAMES[local.getUTCMonth()]} ${local.getUTCDate()}, ${local.getUTCFullYear()}`;
}

function firstNameOf(name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (trimmed === "") return MISSING_NAME_FALLBACK;
  return trimmed.split(/\s+/)[0];
}

export function buildTemplateVariables(
  customer: SmsCustomer,
  context: TemplateStoreContext
): Record<string, string> {
  return {
    firstName: firstNameOf(customer.name),
    name: (customer.name ?? "").trim() || MISSING_NAME_FALLBACK,
    storeName: context.storeName,
    orderCount: String(customer.order_count),
    totalSpent: String(customer.total_spent),
    lastOrderDate: customer.last_order_at ? formatManilaDate(customer.last_order_at) : "",
  };
}

/** The placeholders a template uses, in order of first appearance, deduped. */
export function extractVariables(template: string): string[] {
  const found = [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
  return [...new Set(found)];
}

/** Every variable name a template may legally use. */
export function knownVariableNames(): string[] {
  return Object.keys(
    buildTemplateVariables(
      {
        id: "",
        name: null,
        phone_e164: null,
        order_count: 0,
        total_spent: 0,
        last_order_at: null,
        channels_used: [],
        sms_consent: false,
        sms_opt_out: false,
      },
      { storeName: "" }
    )
  );
}

export interface TemplateValidation {
  isValid: boolean;
  unknownVariables: string[];
}

/** Editor-side guard: catch a typo'd placeholder before a campaign can be saved. */
export function validateTemplate(template: string): TemplateValidation {
  const known = new Set(knownVariableNames());
  const unknownVariables = extractVariables(template).filter((name) => !known.has(name));
  return { isValid: unknownVariables.length === 0, unknownVariables };
}

export function renderMessage(
  template: string,
  customer: SmsCustomer,
  context: TemplateStoreContext
): string {
  const variables = buildTemplateVariables(customer, context);
  const missingVariables: string[] = [];

  const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    if (variables[name] === undefined) {
      missingVariables.push(name);
      return "";
    }
    return variables[name];
  });

  if (missingVariables.length > 0) {
    throw new TemplateVariableError([...new Set(missingVariables)]);
  }

  return rendered;
}

export type SmsEncoding = "GSM7" | "UCS2";

export interface SmsSegmentCount {
  /** Billable character units: septets for GSM-7, UTF-16 code units for UCS-2. */
  length: number;
  segments: number;
  encoding: SmsEncoding;
}

function gsmSeptetLength(text: string): number | null {
  let septets = 0;
  for (const char of text) {
    if (GSM_BASIC_SET.has(char)) {
      septets += 1;
      continue;
    }
    if (GSM_EXTENDED_SET.has(char)) {
      septets += 2;
      continue;
    }
    return null; // One foreign character re-encodes the whole message.
  }
  return septets;
}

function segmentsFor(length: number, singleLimit: number, multipartLimit: number): number {
  if (length === 0) return 0;
  if (length <= singleLimit) return 1;
  return Math.ceil(length / multipartLimit);
}

export function countSmsSegments(text: string): SmsSegmentCount {
  const septets = gsmSeptetLength(text);

  if (septets !== null) {
    return {
      length: septets,
      segments: segmentsFor(septets, GSM_SINGLE_LIMIT, GSM_MULTIPART_LIMIT),
      encoding: "GSM7",
    };
  }

  // UCS-2 is billed per UTF-16 code unit, so an emoji costs two, not one.
  const units = text.length;
  return {
    length: units,
    segments: segmentsFor(units, UCS2_SINGLE_LIMIT, UCS2_MULTIPART_LIMIT),
    encoding: "UCS2",
  };
}
