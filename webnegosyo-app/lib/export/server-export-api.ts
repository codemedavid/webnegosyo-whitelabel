/**
 * The Export screen's talk with the web app (`POST /api/exports`): what this
 * account may export, and what a file would hold before it is downloaded.
 *
 * The server owns the catalogue — sheet names, columns, who may have which —
 * so the app never carries a second copy that could drift from the web Export
 * page. The file itself comes from `downloadServerExport` (`server-export.ts`).
 */

import { getAccessTokenBounded } from "../authorized-post";
import { getWebAppUrl } from "../web-app-url";

const SESSION_TIMEOUT_MS = 8_000;
/** A preview of a long period reads every order of it: give it the server's own time. */
export const EXPORT_REQUEST_TIMEOUT_MS = 45_000;

export const EXPORT_SIGNED_OUT = "Please sign in again.";
const UNREACHABLE = "Could not reach the server. Check your connection and try again.";
const GENERIC_FAILURE = "That could not be loaded. Try again in a moment.";

export interface ExportCard {
  id: string;
  name: string;
  rowIs: string;
  columns: string[];
  /** Row-by-row sheets take a shorter range. */
  isDetail: boolean;
  /** Why it cannot be ticked, or null. */
  lockedNote: string | null;
}

export interface ExportCardGroup {
  id: string;
  label: string;
  cards: ExportCard[];
}

export interface ExportPackChoice {
  id: string;
  label: string;
  about: string;
  sheets: string[];
}

export interface ExportCatalogue {
  groups: ExportCardGroup[];
  packs: ExportPackChoice[];
  defaults: string[];
  maxDetailDays: number;
  /** Store-local today, YYYY-MM-DD. */
  today: string;
  /** Set for a branch account: every file is that branch's. */
  branchLabel: string | null;
  isMixedBackend: boolean;
}

export interface ExportPreviewSheet {
  id: string;
  name: string;
  rowIs: string;
  columns: string[];
  /** null = only known once the file is built. */
  rows: number | null;
  notes: string[];
}

export interface ExportPreview {
  periodLabel: string;
  branchLabel: string;
  sheets: ExportPreviewSheet[];
  leftOut: { name: string; note: string }[];
}

export const EXPORT_PERIODS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom" },
] as const;
export type ExportPeriodId = (typeof EXPORT_PERIODS)[number]["id"];

export interface ExportPeriod {
  preset: ExportPeriodId;
  from?: string;
  to?: string;
}

export type ExportFormat = "xlsx" | "csv";

export interface ExportChoice {
  tenantId: string;
  sheets: readonly string[];
  period: ExportPeriod;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The period as the server takes it: a custom range carries its two days, a preset carries none. */
export function exportPeriod(preset: ExportPeriodId, from: string, to: string): ExportPeriod {
  return preset === "custom" ? { preset, from, to } : { preset };
}

export function dayCountInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Why these dates cannot be exported with these sheets, or null. Presets are always short enough. */
export function exportPeriodProblem(period: ExportPeriod, picked: readonly ExportCard[], catalogue: Pick<ExportCatalogue, "today" | "maxDetailDays">): string | null {
  if (period.preset !== "custom") return null;
  const { from, to } = period;
  if (!from || !to || !DAY_KEY.test(from) || !DAY_KEY.test(to)) return "Pick a start day and an end day.";
  if (from > to) return "The start day is after the end day.";
  if (to > catalogue.today) return "The end day is in the future.";
  const days = dayCountInclusive(from, to);
  const detail = picked.find((card) => card.isDetail);
  if (detail && days > catalogue.maxDetailDays) {
    return `${detail.name} lists every row, so one file covers up to ${catalogue.maxDetailDays} days. You picked ${days}. Shorten the dates, or untick the row-by-row sheets.`;
  }
  return null;
}

export interface ExportStartParams {
  sheets?: string | string[];
  period?: string | string[];
  from?: string | string[];
  to?: string | string[];
  days?: string | string[];
}

export interface ExportStartChoice {
  preset: ExportPeriodId;
  from: string;
  to: string;
  picked: string[];
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function daysBefore(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What the screen opens with when a report's Export button sent it here
 * (`exportHref`): that report's sheets, as far as this account may have them,
 * and its dates. Anything unusable falls back to the screen's own start —
 * today, the default sheets — never to an error.
 */
export function exportStartChoice(params: ExportStartParams, catalogue: Pick<ExportCatalogue, "groups" | "defaults" | "today">): ExportStartChoice {
  const asked = new Set(one(params.sheets).split(",").filter(Boolean));
  const open = openCards(catalogue)
    .map((card) => card.id)
    .filter((id) => asked.has(id));
  const picked = open.length > 0 ? open : catalogue.defaults;
  const today = catalogue.today;

  const period = one(params.period);
  if (period !== "custom" && EXPORT_PERIODS.some((option) => option.id === period)) {
    return { preset: period as ExportPeriodId, from: today, to: today, picked };
  }
  const from = one(params.from);
  const to = one(params.to);
  // A period still running (this week) ends after today: the file can only go up to today.
  if (DAY_KEY.test(from) && DAY_KEY.test(to) && from <= to && from <= today) return { preset: "custom", from, to: to > today ? today : to, picked };
  const days = Number(one(params.days));
  if (Number.isInteger(days) && days >= 1 && days <= 366) {
    return days === 1 ? { preset: "today", from: today, to: today, picked } : { preset: "custom", from: daysBefore(today, days - 1), to: today, picked };
  }
  return { preset: "today", from: today, to: today, picked };
}

/** Every sheet this account may tick, in the catalogue's order. */
export function openCards(catalogue: Pick<ExportCatalogue, "groups">): ExportCard[] {
  return catalogue.groups.flatMap((group) => group.cards.filter((card) => !card.lockedNote));
}

/** Tick or untick one sheet; the result keeps the catalogue's order and never holds a locked sheet. */
export function toggleSheet(picked: readonly string[], id: string, catalogue: Pick<ExportCatalogue, "groups">): string[] {
  const next = new Set(picked);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return openCards(catalogue)
    .map((card) => card.id)
    .filter((cardId) => next.has(cardId));
}

/** The ready-made set whose sheets are exactly the ticked ones, if any. */
export function activePackId(picked: readonly string[], packs: readonly ExportPackChoice[]): string | null {
  const key = [...picked].sort().join(",");
  return packs.find((pack) => [...pack.sheets].sort().join(",") === key)?.id ?? null;
}

export function previewRowsText(rows: number | null): string {
  if (rows === null) return "counted in the file";
  return `${rows.toLocaleString("en-PH")} ${rows === 1 ? "row" : "rows"}`;
}

/** The link that downloads this choice (`GET /api/exports?…`), the same one the web Export page uses. */
export function exportDownloadPath(choice: ExportChoice, format: ExportFormat): string {
  const parts = [`tenantId=${encodeURIComponent(choice.tenantId)}`, `sheets=${choice.sheets.map(encodeURIComponent).join(",")}`, `period=${choice.period.preset}`];
  if (choice.period.from) parts.push(`from=${choice.period.from}`);
  if (choice.period.to) parts.push(`to=${choice.period.to}`);
  parts.push(`format=${format}`, "source=page");
  return `/api/exports?${parts.join("&")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The catalogue as the server sent it, with anything malformed dropped rather than trusted. */
export function parseCatalogue(body: unknown): ExportCatalogue | null {
  if (!isRecord(body) || !isRecord(body.catalogue)) return null;
  const raw = body.catalogue;
  if (!Array.isArray(raw.groups) || !DAY_KEY.test(text(raw.today))) return null;
  const groups = raw.groups.filter(isRecord).map(
    (group): ExportCardGroup => ({
      id: text(group.id),
      label: text(group.label),
      cards: (Array.isArray(group.cards) ? group.cards : [])
        .filter(isRecord)
        .filter((card) => text(card.id) !== "" && text(card.name) !== "")
        .map(
          (card): ExportCard => ({
            id: text(card.id),
            name: text(card.name),
            rowIs: text(card.rowIs),
            columns: texts(card.columns),
            isDetail: card.isDetail === true,
            lockedNote: text(card.lockedNote) || null,
          }),
        ),
    }),
  );
  const open = new Set(groups.flatMap((group) => group.cards.filter((card) => !card.lockedNote).map((card) => card.id)));
  const onlyOpen = (ids: unknown) => texts(ids).filter((id) => open.has(id));
  return {
    groups: groups.filter((group) => group.cards.length > 0),
    packs: (Array.isArray(raw.packs) ? raw.packs : [])
      .filter(isRecord)
      .map((pack): ExportPackChoice => ({ id: text(pack.id), label: text(pack.label), about: text(pack.about), sheets: onlyOpen(pack.sheets) }))
      .filter((pack) => pack.id !== "" && pack.label !== "" && pack.sheets.length > 0),
    defaults: onlyOpen(raw.defaults),
    maxDetailDays: typeof raw.maxDetailDays === "number" && raw.maxDetailDays > 0 ? raw.maxDetailDays : 93,
    today: text(raw.today),
    branchLabel: text(raw.branchLabel) || null,
    isMixedBackend: raw.isMixedBackend === true,
  };
}

export function parsePreview(body: unknown): ExportPreview | null {
  if (!isRecord(body) || !isRecord(body.preview)) return null;
  const raw = body.preview;
  if (!Array.isArray(raw.sheets)) return null;
  const header = isRecord(raw.header) ? raw.header : {};
  return {
    periodLabel: text(header.periodLabel),
    branchLabel: text(header.branchLabel),
    sheets: raw.sheets.filter(isRecord).map(
      (sheet): ExportPreviewSheet => ({
        id: text(sheet.id),
        name: text(sheet.name),
        rowIs: text(sheet.rowIs),
        columns: texts(sheet.columns),
        rows: typeof sheet.rows === "number" ? sheet.rows : null,
        notes: texts(sheet.notes),
      }),
    ),
    leftOut: (Array.isArray(raw.leftOut) ? raw.leftOut : []).filter(isRecord).map((sheet) => ({ name: text(sheet.name), note: text(sheet.note) })),
  };
}

export class ExportRequestError extends Error {}

export async function exportToken(): Promise<string> {
  const token = await getAccessTokenBounded(SESSION_TIMEOUT_MS);
  if (!token) throw new ExportRequestError(EXPORT_SIGNED_OUT);
  return token;
}

/** One bounded POST as the signed-in person. Throws a sentence the owner can read. */
async function postExports(body: unknown): Promise<unknown> {
  const token = await exportToken();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted AND raced: React Native's fetch has not always turned an abort into a rejection.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ExportRequestError(UNREACHABLE));
    }, EXPORT_REQUEST_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}/api/exports`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      expiry,
    ]);
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const sentence = isRecord(parsed) ? text(parsed.error).trim() : "";
      throw new ExportRequestError(sentence ? sentence.slice(0, 300) : response.status === 429 ? "That was a lot of tries. Give it a minute." : GENERIC_FAILURE);
    }
    return parsed;
  } catch (cause) {
    if (cause instanceof ExportRequestError) throw cause;
    throw new ExportRequestError(UNREACHABLE);
  } finally {
    clearTimeout(timer);
  }
}

/** What this account may export from this store. No order is read. */
export async function fetchExportCatalogue(tenantId: string): Promise<ExportCatalogue> {
  const catalogue = parseCatalogue(await postExports({ tenantId, mode: "catalogue", sheets: ["summary"], period: { preset: "today" } }));
  if (!catalogue) throw new ExportRequestError(GENERIC_FAILURE);
  return catalogue;
}

/** What the file would hold: each tab, its row count, anything left out and why. Nothing is logged. */
export async function fetchExportPreview(choice: ExportChoice): Promise<ExportPreview> {
  const preview = parsePreview(await postExports({ tenantId: choice.tenantId, mode: "preview", sheets: choice.sheets, period: choice.period }));
  if (!preview) throw new ExportRequestError(GENERIC_FAILURE);
  return preview;
}
