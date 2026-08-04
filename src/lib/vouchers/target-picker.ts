/**
 * Turning a tenant's menu into the choices behind a scoped voucher.
 *
 * A voucher scoped to products or categories carries a list of ids that the
 * engine matches against cart lines. Those ids are meaningless to a merchant,
 * so everything here exists to present them as names and hand back the ids
 * unchanged.
 *
 * Pure: no I/O, no framework. The picker component owns the fetching.
 */

export interface TargetOption {
  /** The id the engine matches on — a menu item id or a category id. */
  id: string
  label: string
  /** Category name, for products. Absent for categories and orphaned items. */
  group?: string
}

interface NamedRecord {
  id: string
  name: string
}

interface MenuItemLike extends NamedRecord {
  category_id?: string | null
}

export interface TargetSelectionSummary {
  selectedCount: number
  /** Saved targets with no matching option — usually a deleted item. */
  missingIds: readonly string[]
}

/**
 * An item whose category was deleted still appears, ungrouped. Hiding it would
 * make an existing voucher's target un-editable through the very form that has
 * to save it back.
 */
export function toProductOptions(
  items: readonly MenuItemLike[],
  categories: readonly NamedRecord[],
): readonly TargetOption[] {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  return items.map((item) => {
    const group = item.category_id ? categoryNames.get(item.category_id) : undefined
    return group ? { id: item.id, label: item.name, group } : { id: item.id, label: item.name }
  })
}

export function toCategoryOptions(categories: readonly NamedRecord[]): readonly TargetOption[] {
  return categories.map((category) => ({ id: category.id, label: category.name }))
}

/** Case-insensitive substring match on the name or the category it sits under. */
export function filterTargetOptions(
  options: readonly TargetOption[],
  query: string,
): readonly TargetOption[] {
  const needle = (query ?? '').trim().toLowerCase()
  if (needle === '') return options

  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) ||
      (option.group?.toLowerCase().includes(needle) ?? false),
  )
}

/** Immutable add/remove. Duplicates are collapsed on the way through. */
export function toggleTargetId(
  selected: readonly string[],
  id: string,
): readonly string[] {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return [...next]
}

export function summarizeTargetSelection(
  selected: readonly string[],
  options: readonly TargetOption[],
): TargetSelectionSummary {
  const known = new Set(options.map((option) => option.id))
  const unique = [...new Set(selected)]

  return {
    selectedCount: unique.length,
    missingIds: unique.filter((id) => !known.has(id)),
  }
}
