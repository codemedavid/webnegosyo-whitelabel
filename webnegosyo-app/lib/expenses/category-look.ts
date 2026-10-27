/**
 * How an expense category looks: one line icon and one group colour.
 *
 * The seed list stores a two-letter code in `icon` ("LP", "IC"); the app draws
 * a real mark instead, looked up by the category's `systemKey`. A category the
 * owner made (no system key) gets its initials, coloured by its group, so it
 * still sits in the same family as the seeded ones.
 *
 * The colour belongs to the GROUP, not the category: Palengke and Yelo are both
 * ingredients and share green. The same hue is used in the add grid, the list,
 * the month split on the hero card and Profit's bars, so it is learned once.
 */
import type { IconName } from "../../components/Icon";
import { colors } from "../../theme/colors";
import type { ExpenseCategory, ExpenseGroup } from "./types";

export interface GroupTone {
  /** The mark and bar colour on a white card. */
  readonly ink: string;
  /** The tile behind the mark. */
  readonly tint: string;
  /** A bar on the dark hero card. */
  readonly onHero: string;
}

export type CategoryMark =
  | { readonly kind: "icon"; readonly icon: IconName }
  | { readonly kind: "initials"; readonly text: string };

export interface CategoryLook {
  readonly mark: CategoryMark;
  readonly tone: GroupTone;
}

/** The mark for every seeded category (contract §4 / `SEED_CATEGORIES`). */
export const SYSTEM_ICONS: Readonly<Record<string, IconName>> = Object.freeze({
  ingredients: "basket",
  ice: "ice",
  drinks: "cup",
  packaging: "box",
  wages: "people",
  gov_contributions: "shield",
  staff_meals: "utensils",
  thirteenth_month: "gift",
  rent: "home",
  electricity: "bolt",
  water: "droplet",
  lpg: "flame",
  internet: "wifi",
  delivery_fees: "bike",
  platform_fees: "percent",
  transport: "car",
  cleaning: "sparkle",
  repairs: "wrench",
  marketing: "megaphone",
  permits: "document",
  accounting: "calculator",
  bank_charges: "bank",
  other: "dots",
  equipment: "appliance",
  owner_draw: "cash-out",
  bank_deposit: "bank",
  loan_payment: "bank",
});

export function groupTone(group: ExpenseGroup): GroupTone {
  return colors.expenseGroups[group] ?? colors.expenseGroups.other;
}

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * "Kape supplier" → "KS", "Ukay" → "UK", "13th month" → "13". Words in
 * brackets are skipped ("Rent (Upa)" → "R" + next word), and never more than
 * two characters, so the tile never overflows.
 */
export function categoryInitials(name: string): string {
  const outside = name.replace(/\([^)]*\)/g, " ");
  const words = outside.match(WORD) ?? name.match(WORD) ?? [];
  const [first = "", second = ""] = words;
  if (first === "") return "?";
  if (second === "") return first.slice(0, 2).toUpperCase();
  return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
}

type LookSource = Pick<ExpenseCategory, "systemKey" | "name" | "group">;

export function categoryLook(category: LookSource | null | undefined): CategoryLook {
  if (!category) return { mark: { kind: "icon", icon: "dots" }, tone: groupTone("other") };
  const icon = category.systemKey ? SYSTEM_ICONS[category.systemKey] : undefined;
  const mark: CategoryMark = icon ? { kind: "icon", icon } : { kind: "initials", text: categoryInitials(category.name) };
  return { mark, tone: groupTone(category.group) };
}

/**
 * The short name a tight grid cell shows: the Filipino word when the seed
 * name carries one in brackets ("Ice (Yelo)" → "Yelo"), else the name up to
 * its first "&" or "/" ("Cleaning & supplies" → "Cleaning").
 */
export function shortCategoryName(name: string): string {
  const bracket = /\(([^)]+)\)/.exec(name);
  const inside = bracket?.[1]?.trim() ?? "";
  if (inside !== "" && inside.split(/\s+/).length <= 2) return inside;
  const head = (name.replace(/\([^)]*\)/g, " ").split(/\s*[&/]\s*/)[0] ?? "").trim();
  return head.length > 0 ? head : name;
}
