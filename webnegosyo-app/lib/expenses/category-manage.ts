/**
 * The Categories screen's rules, pure (mirrors the web's `CategoriesDialog`,
 * src/components/admin/expenses/categories-dialog.tsx).
 *
 * The database is the boundary (`expense_categories_guard`): a starter
 * category keeps its group and "needs a note", a used category keeps its group,
 * live names are unique. This module only says so BEFORE the owner taps Save,
 * and works out sort orders so a new category lands at the end of its group.
 */
import { GROUP_LABELS, sortCategories } from "./categories";
import { EXPENSE_GROUPS, type ExpenseCategory, type ExpenseGroup } from "./types";

/** The Categories screen's route (Expenses header, the add sheet's "All categories" list). */
export const EXPENSE_CATEGORIES_PATH = "/(main)/expense-categories";

/** The database's limit (`expense_categories_name_ck`). */
export const MAX_CATEGORY_NAME_LENGTH = 60;

/** Gap between sort orders, so a new category slots in without renumbering (same as the web). */
export const SORT_STEP = 10;

/** What each group means for Profit, in the owner's words (same as the web). */
export const GROUP_HINTS: Readonly<Record<ExpenseGroup, string>> = Object.freeze({
  ingredients: "Food and drink cost",
  staff: "Labor",
  occupancy: "Rent",
  utilities: "Power, water, gas, internet",
  operating: "Day-to-day running costs",
  admin: "Permits, accountant, bank",
  other: "Anything else",
  capex: "Shown below operating profit",
  not_expense: "Moves cash only, never lowers Profit",
});

export interface CategoryDraft {
  /** Absent = a new category. */
  id?: string;
  name: string;
  group: ExpenseGroup;
  needsNote: boolean;
  sortOrder: number;
  /** A seeded category: the database keeps its group and note rule. */
  isStarter: boolean;
}

export function draftForNew(categories: readonly ExpenseCategory[], group: ExpenseGroup): CategoryDraft {
  return { name: "", group, needsNote: false, sortOrder: nextSortOrder(categories, group), isStarter: false };
}

export function draftForEdit(category: ExpenseCategory): CategoryDraft {
  return {
    id: category.id,
    name: category.name,
    group: category.group,
    needsNote: category.needsNote,
    sortOrder: category.sortOrder,
    isStarter: category.systemKey !== null,
  };
}

/** One step past the last category of the group (archived ones included, so a restore never collides). */
export function nextSortOrder(categories: readonly ExpenseCategory[], group: ExpenseGroup): number {
  const inGroup = categories.filter((category) => category.group === group);
  const last = inGroup.reduce((max, category) => Math.max(max, category.sortOrder), -SORT_STEP);
  return Math.max(0, last + SORT_STEP);
}

/** Why a field can't change, or null. Shown under the group picker. */
export function lockHint(draft: CategoryDraft): string | null {
  if (draft.isStarter) {
    return "Starter categories keep their group and note setting, so Profit sorts them the same way everywhere. You can still rename them.";
  }
  if (draft.id) return "Once a category has expenses, its group stays. Add a new category for another group.";
  return null;
}

/** A starter category's group and note rule never change (the database refuses it). */
export function canChangeGroup(draft: CategoryDraft): boolean {
  return !draft.isStarter;
}

/** The owner's problem with the draft before anything is sent, or null. */
export function draftProblem(draft: CategoryDraft, categories: readonly ExpenseCategory[]): string | null {
  const name = draft.name.trim();
  if (name === "") return "Name the category.";
  if (name.length > MAX_CATEGORY_NAME_LENGTH) return `Keep the name under ${MAX_CATEGORY_NAME_LENGTH + 1} characters.`;
  const folded = name.toLocaleLowerCase();
  const clash = categories.find(
    (category) => category.archivedAt === null && category.id !== draft.id && category.name.trim().toLocaleLowerCase() === folded,
  );
  if (clash) return "There is already a category with that name.";
  return null;
}

/** True when saving would change nothing (Save stays quiet). */
export function isUnchanged(draft: CategoryDraft, categories: readonly ExpenseCategory[]): boolean {
  if (!draft.id) return false;
  const current = categories.find((category) => category.id === draft.id);
  return (
    current !== undefined &&
    current.name === draft.name.trim() &&
    current.group === draft.group &&
    current.needsNote === draft.needsNote
  );
}

export interface CategorySection {
  group: ExpenseGroup;
  label: string;
  hint: string;
  items: ExpenseCategory[];
}

/** Live categories by group, every group shown (an empty one still offers "Add"). */
export function categorySections(categories: readonly ExpenseCategory[]): CategorySection[] {
  const sorted = sortCategories(categories.filter((category) => category.archivedAt === null));
  return EXPENSE_GROUPS.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    hint: GROUP_HINTS[group],
    items: sorted.filter((category) => category.group === group),
  }));
}

export function archivedCategories(categories: readonly ExpenseCategory[]): ExpenseCategory[] {
  return sortCategories(categories.filter((category) => category.archivedAt !== null));
}

export interface SortWrite {
  category: ExpenseCategory;
  sortOrder: number;
}

/**
 * Move a category one place up (-1) or down (1) within its group: the two
 * sort orders swap. Two rows with the same sort order (seeded by hand, or a
 * web edit) get distinct ones so the move still shows. Null = already at the
 * edge, or not a live category.
 */
export function moveWrites(
  categories: readonly ExpenseCategory[],
  categoryId: string,
  direction: -1 | 1,
): [SortWrite, SortWrite] | null {
  const category = categories.find((entry) => entry.id === categoryId && entry.archivedAt === null);
  if (!category) return null;
  const siblings = sortCategories(categories.filter((entry) => entry.group === category.group && entry.archivedAt === null));
  const index = siblings.findIndex((entry) => entry.id === category.id);
  const neighbour = siblings[index + direction];
  if (!neighbour) return null;
  if (category.sortOrder === neighbour.sortOrder) {
    const moved = Math.max(0, neighbour.sortOrder + direction);
    // At sort 0 moving up, the neighbour steps down instead.
    const other = moved === neighbour.sortOrder ? neighbour.sortOrder + 1 : neighbour.sortOrder;
    return [
      { category, sortOrder: moved },
      { category: neighbour, sortOrder: other },
    ];
  }
  return [
    { category, sortOrder: neighbour.sortOrder },
    { category: neighbour, sortOrder: category.sortOrder },
  ];
}

/** Can this category move up / down within its group? */
export function moveability(categories: readonly ExpenseCategory[], categoryId: string): { up: boolean; down: boolean } {
  return { up: moveWrites(categories, categoryId, -1) !== null, down: moveWrites(categories, categoryId, 1) !== null };
}

/** Replace (or add) one category in a list, by id. */
export function withCategory(categories: readonly ExpenseCategory[], next: ExpenseCategory): ExpenseCategory[] {
  return categories.some((entry) => entry.id === next.id)
    ? categories.map((entry) => (entry.id === next.id ? next : entry))
    : [...categories, next];
}
