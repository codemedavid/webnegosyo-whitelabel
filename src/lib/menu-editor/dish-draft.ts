/**
 * "Has the owner changed anything?" for the dish editor.
 *
 * The editor's state is a handful of plain objects and arrays. Comparing a
 * serialized snapshot is enough, but only if the serialization is stable:
 * immutable updates (`{ ...option, [field]: value }`) can add a key at the end
 * or set one to `undefined`, and neither is a change the owner made.
 */

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries.map(([key, entry]) => [key, normalize(entry)]))
  }
  return value
}

export function serializeDraft(draft: unknown): string {
  return JSON.stringify(normalize(draft))
}

export function isDraftChanged(baseline: string, draft: unknown): boolean {
  return serializeDraft(draft) !== baseline
}
