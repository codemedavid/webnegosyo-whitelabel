/**
 * The automation editor's state, decided here so the screen stays layout.
 *
 * A draft starts from a saved automation or from a recipe's defaults; the
 * headline knob moves in steps inside the recipe's limits; word chips insert
 * `{{word}}` at the cursor; and a message is refused BEFORE it reaches the
 * server when it names a word this recipe cannot fill (the server refuses it
 * too, in its own words — this only saves the round trip). Pure.
 */

import type {
  Automation,
  AutomationDraft,
  AutomationParams,
  ParamKey,
  RecipeId,
  RecipeInfo,
  RunMode,
} from "./api";

/** Three GSM-7 texts; the server's MAX_MESSAGE_CHARS. */
export const MAX_MESSAGE_CHARS = 459;
/** Days knobs this long move in fives: 30 → 35, not 30 → 31. */
const COARSE_STEP = 5;
const COARSE_KNOBS: readonly ParamKey[] = ["inactiveDays"];
const ORDER_COUNT_CHOICES = [1, 2, 3, 5, 10] as const;
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type MessageLanguage = "en" | "tl";

export interface EditorDraft {
  recipe: RecipeId;
  name: string | null;
  params: AutomationParams;
  messageTemplate: string;
  runMode: RunMode;
  reentryDays: number | null;
}

export function draftFromRecipe(info: RecipeInfo): EditorDraft {
  return {
    recipe: info.id,
    name: null,
    params: { ...info.defaults },
    messageTemplate: info.defaultMessage,
    runMode: "auto",
    reentryDays: null,
  };
}

export function draftFromAutomation(automation: Automation): EditorDraft {
  return {
    recipe: automation.recipe,
    name: automation.name,
    params: { ...automation.params },
    messageTemplate: automation.messageTemplate,
    runMode: automation.runMode,
    reentryDays: automation.reentryDays,
  };
}

/** What the API takes; an empty name lets the server use the recipe title. */
export function toApiDraft(draft: EditorDraft): AutomationDraft {
  return {
    recipe: draft.recipe,
    ...(draft.name ? { name: draft.name } : {}),
    params: draft.params,
    messageTemplate: draft.messageTemplate,
    runMode: draft.runMode,
    reentryDays: draft.reentryDays,
  };
}

export function isDraftDirty(initial: EditorDraft, draft: EditorDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(draft);
}

/** The knob's value: the owner's, else the recipe default, else its floor. */
export function knobValue(draft: EditorDraft, knob: ParamKey, info: RecipeInfo): number {
  return draft.params[knob] ?? info.defaults[knob] ?? info.limits[knob]?.[0] ?? 0;
}

function clamp(value: number, limits: readonly [number, number] | undefined): number {
  if (!limits) return value;
  return Math.min(limits[1], Math.max(limits[0], value));
}

/** One tap of the stepper, held inside the recipe's limits. */
export function stepKnob(
  value: number,
  direction: 1 | -1,
  knob: ParamKey,
  limits: readonly [number, number] | undefined,
): number {
  if (!COARSE_KNOBS.includes(knob)) return clamp(value + direction, limits);
  const next = direction === 1
    ? Math.floor(value / COARSE_STEP) * COARSE_STEP + COARSE_STEP
    : Math.ceil(value / COARSE_STEP) * COARSE_STEP - COARSE_STEP;
  return clamp(next, limits);
}

export function canStep(value: number, direction: 1 | -1, limits: readonly [number, number] | undefined): boolean {
  if (!limits) return direction === 1 || value > 0;
  return direction === 1 ? value < limits[1] : value > limits[0];
}

function orderCountLabel(count: number): string {
  if (count <= 1) return "Everyone";
  if (count === 2) return "Repeat guests (2+ orders)";
  return `Regulars (${count}+ orders)`;
}

/** "Everyone / Repeat guests (2+ orders) / …" for recipes that filter by orders; [] otherwise. */
export function minOrderOptions(info: RecipeInfo, current: number | undefined): { label: string; value: number }[] {
  if (info.defaults.minOrderCount === undefined) return [];
  const limits = info.limits.minOrderCount;
  const inRange = ORDER_COUNT_CHOICES.filter((n) => !limits || (n >= limits[0] && n <= limits[1]));
  const values = current !== undefined && !inRange.some((n) => n === current) ? [...inRange, current] : [...inRange];
  return [...values].sort((a, b) => a - b).map((value) => ({ label: orderCountLabel(value), value }));
}

export interface Selection {
  start: number;
  end: number;
}

/** Puts `{{word}}` where the cursor is (replacing a selection), with a space before it when needed. */
export function insertWord(text: string, selection: Selection, word: string): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const before = text.slice(0, start);
  const needsSpace = before.length > 0 && !/\s$/.test(before);
  const token = `${needsSpace ? " " : ""}{{${word}}}`;
  return { text: `${before}${token}${text.slice(end)}`, cursor: start + token.length };
}

/**
 * What decides who gets the text: the knobs, and which guest details the
 * message needs (a guest without a favourite can't get a {{favorite}} text).
 * Typing words does not change it, so typing never re-reads the store.
 */
export function audienceKey(draft: AutomationDraft): string {
  const words = [...new Set([...draft.messageTemplate.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
  return JSON.stringify([draft.recipe, draft.params ?? {}, draft.reentryDays ?? null, draft.runMode ?? "auto", words]);
}

/** Why this message cannot be saved, or null. */
export function messageProblem(text: string, variables: readonly string[]): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return "Write the message first.";
  if (trimmed.length > MAX_MESSAGE_CHARS) return `Keep it under ${MAX_MESSAGE_CHARS} characters — that’s three texts.`;
  const unknown = [...trimmed.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((name) => !variables.includes(name));
  if (unknown.length > 0) {
    return `“{{${unknown[0]}}}” can’t be filled in for this text. Use the word buttons instead.`;
  }
  if (/\{\{|\}\}/.test(trimmed.replace(PLACEHOLDER, ""))) return "A word in {{ }} isn’t finished.";
  return null;
}

/** Which default the message still is, or null once the owner has edited it. */
export function messageLanguage(text: string, info: RecipeInfo): MessageLanguage | null {
  const trimmed = text.trim();
  if (trimmed === info.defaultMessage.trim()) return "en";
  if (trimmed === info.defaultMessageTl.trim()) return "tl";
  return null;
}

export function defaultMessageFor(info: RecipeInfo, language: MessageLanguage): string {
  return language === "tl" ? info.defaultMessageTl : info.defaultMessage;
}

export const LANGUAGE_OPTIONS: readonly { label: string; value: MessageLanguage }[] = [
  { label: "English", value: "en" },
  { label: "Taglish", value: "tl" },
];

export const RUN_MODE_OPTIONS: readonly { label: string; value: RunMode }[] = [
  { label: "Send on its own", value: "auto" },
  { label: "Only when I tap Run now", value: "manual" },
];
