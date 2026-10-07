/**
 * Short refs ("i12", "c3") the model sees instead of real ids.
 *
 * Models garble UUIDs, and a garbled id must fail to resolve rather than point
 * at another dish (the Boost AI precedent, src/lib/boost/ai/facts.ts). Refs
 * also keep customer and staff ids out of the prompt entirely. The book is
 * persisted per conversation (`assistant_conversations.ref_map`) so "i12"
 * means the same dish on every turn.
 */

export type RefKind = 'item' | 'category' | 'customer' | 'staff' | 'ingredient' | 'idea' | 'offer' | 'program' | 'campaign' | 'voucher' | 'import' | 'draft'

const PREFIX: Readonly<Record<RefKind, string>> = {
  item: 'i',
  category: 'k',
  customer: 'c',
  staff: 's',
  ingredient: 'g',
  idea: 'x',
  offer: 'o',
  program: 'p',
  campaign: 'm',
  voucher: 'v',
  /** A photo import waiting for its tap (the proposal id). */
  import: 'n',
  /** One dish inside a photo import (`<proposal id>#<index>`). */
  draft: 'd',
}

const KINDS = Object.keys(PREFIX) as RefKind[]

interface RefEntry {
  kind: RefKind
  id: string
}

export interface RefSnapshot {
  refs: Record<string, RefEntry>
  next: Record<RefKind, number>
}

export interface RefBook {
  /** The ref for this id, issuing the next one for its kind when it is new. */
  refFor(kind: RefKind, id: string): string
  /** The id behind a ref, or null when unknown or issued for another kind. */
  resolve(ref: string, kind: RefKind): string | null
  /** A detached copy to persist. */
  snapshot(): RefSnapshot
}

function isRefKind(value: unknown): value is RefKind {
  return typeof value === 'string' && (KINDS as string[]).includes(value)
}

/** Rebuild a snapshot from storage, dropping anything that is not well formed. */
function sanitize(raw: unknown): RefSnapshot {
  const source = (raw && typeof raw === 'object' ? raw : {}) as { refs?: unknown; next?: unknown }
  const refs: Record<string, RefEntry> = {}
  const next = Object.fromEntries(KINDS.map((kind) => [kind, 1])) as Record<RefKind, number>

  if (source.refs && typeof source.refs === 'object') {
    for (const [ref, entry] of Object.entries(source.refs as Record<string, unknown>)) {
      const candidate = entry as { kind?: unknown; id?: unknown } | null
      if (!candidate || !isRefKind(candidate.kind) || typeof candidate.id !== 'string') continue
      const counter = Number(ref.slice(PREFIX[candidate.kind].length))
      if (!ref.startsWith(PREFIX[candidate.kind]) || !Number.isInteger(counter) || counter < 1) continue
      refs[ref] = { kind: candidate.kind, id: candidate.id }
      next[candidate.kind] = Math.max(next[candidate.kind], counter + 1)
    }
  }
  return { refs, next }
}

export function createRefBook(stored: unknown): RefBook {
  const state = sanitize(stored)
  const byId = new Map<string, string>(
    Object.entries(state.refs).map(([ref, entry]) => [`${entry.kind}:${entry.id}`, ref]),
  )

  return {
    refFor(kind, id) {
      const key = `${kind}:${id}`
      const existing = byId.get(key)
      if (existing) return existing
      const ref = `${PREFIX[kind]}${state.next[kind]}`
      state.next[kind] += 1
      state.refs[ref] = { kind, id }
      byId.set(key, ref)
      return ref
    },
    resolve(ref, kind) {
      const entry = state.refs[ref.trim()]
      return entry && entry.kind === kind ? entry.id : null
    },
    snapshot() {
      return {
        refs: Object.fromEntries(Object.entries(state.refs).map(([ref, entry]) => [ref, { ...entry }])),
        next: { ...state.next },
      }
    },
  }
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value)
}
