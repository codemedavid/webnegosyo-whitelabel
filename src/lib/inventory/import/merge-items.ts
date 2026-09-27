import type { InventoryItem } from '@/types/database'

/**
 * The ingredient list after an import: saved rows replace their old selves,
 * new ones join, and the list stays in the name order the server sends.
 */
export function mergeImportedItems(
  current: readonly InventoryItem[],
  saved: readonly InventoryItem[],
): InventoryItem[] {
  const savedById = new Map(saved.map((item) => [item.id, item]))
  const knownIds = new Set(current.map((item) => item.id))

  return [
    ...current.map((item) => savedById.get(item.id) ?? item),
    ...saved.filter((item) => !knownIds.has(item.id)),
  ].sort((a, b) => a.name.localeCompare(b.name))
}
