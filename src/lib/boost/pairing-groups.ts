/**
 * Pairings are stored as one `upsell_pairs` row (pair_type 'complementary')
 * per source × target. Merchants think in offers instead — "after any burger,
 * suggest fries and a coke" — so rows that share a target list collapse into
 * one group, and saving a group rewrites every row of its sources.
 */

export interface PairingRow {
  id: string
  source_item_id: string
  target_item_id: string
  display_order: number
  is_active: boolean
}

export interface PairingGroup {
  /** Stable across reloads: derived from the targets and live state. */
  key: string
  sourceIds: string[]
  targetIds: string[]
  isActive: boolean
  pairIds: string[]
}

export interface PairingSaveInput {
  previousSourceIds: readonly string[]
  sourceIds: readonly string[]
  targetIds: readonly string[]
  isActive: boolean
}

export interface PairingInsertRow {
  source_item_id: string
  target_item_id: string
  display_order: number
  is_active: boolean
}

export interface PairingSavePlan {
  deleteSourceIds: string[]
  rows: PairingInsertRow[]
}

interface SourceBucket {
  rows: PairingRow[]
  isActive: boolean
}

export function groupPairings(rows: readonly PairingRow[]): PairingGroup[] {
  const bySource = new Map<string, SourceBucket>()
  for (const row of rows) {
    const bucket = bySource.get(row.source_item_id) ?? { rows: [], isActive: false }
    bySource.set(row.source_item_id, {
      rows: [...bucket.rows, row],
      isActive: bucket.isActive || row.is_active,
    })
  }

  const groups = new Map<string, PairingGroup>()
  for (const [sourceId, bucket] of bySource) {
    const targetIds = [...bucket.rows]
      .sort((a, b) => a.display_order - b.display_order || a.target_item_id.localeCompare(b.target_item_id))
      .map((row) => row.target_item_id)
    const key = `${bucket.isActive ? 'on' : 'off'}:${targetIds.join(',')}`
    const existing = groups.get(key)
    const pairIds = bucket.rows.map((row) => row.id)
    groups.set(key, existing
      ? { ...existing, sourceIds: [...existing.sourceIds, sourceId], pairIds: [...existing.pairIds, ...pairIds] }
      : { key, sourceIds: [sourceId], targetIds, isActive: bucket.isActive, pairIds })
  }

  return [...groups.values()]
    .map((group) => ({ ...group, sourceIds: [...group.sourceIds].sort() }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.key.localeCompare(b.key))
}

export function planPairingSave(input: PairingSaveInput): PairingSavePlan {
  const sourceIds = [...new Set(input.sourceIds)]
  const targetIds = [...new Set(input.targetIds)]
  const deleteSourceIds = [...new Set([...input.previousSourceIds, ...sourceIds])]

  const rows = sourceIds.flatMap((sourceId) =>
    targetIds
      .filter((targetId) => targetId !== sourceId)
      .map((targetId, index) => ({
        source_item_id: sourceId,
        target_item_id: targetId,
        display_order: index,
        is_active: input.isActive,
      }))
  )

  return { deleteSourceIds, rows }
}
