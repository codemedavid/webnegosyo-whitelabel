/**
 * Turn whatever the model returned into offers that can actually go live.
 *
 * The model is untrusted input. Every item must resolve to an available dish
 * on THIS menu, an upgrade must cost more than what it upgrades, a combo must
 * be cheaper than ordering separately, and nothing may duplicate an offer the
 * store already runs. Anything that fails is dropped, never repaired into a
 * guess — a smaller honest list beats a confident wrong one.
 *
 * The output is the same `BoostIdea` shape the "Ready to go" cards use, so an
 * approved AI proposal goes live through the exact same path.
 */

import { z } from 'zod'
import type { ComboIdea, ComboPickIdea, LastCallIdea, PairingIdea, UpgradeIdea, BoostIdea } from '../ideas'
import { comboRegularPrice, describeSavings, suggestComboPrice } from '../pricing'
import { MAX_PAIRING_TARGETS } from '../pairing-limits'

export interface ProposalItem {
  id: string
  name: string
  price: number
  categoryName: string | null
  isAvailable: boolean
}

export interface ProposalContext {
  items: ReadonlyMap<string, ProposalItem>
  refToId: Readonly<Record<string, string>>
  existing: {
    /** Sorted item ids of each live combo, joined with '|'. */
    comboKeys: ReadonlySet<string>
    upgradeSourceIds: ReadonlySet<string>
    pairingSourceIds: ReadonlySet<string>
  }
}

export interface NormalizedProposals {
  summary: string
  ideas: BoostIdea[]
}

export const MAX_AI_COMBOS = 4
export const MAX_AI_UPGRADES = 4
export const MAX_AI_PAIRINGS = 4
const MAX_COMBO_PICKS = 5
const MAX_PICK_COUNT = 3
const MAX_PICK_CHOICES = 12
const MAX_LAST_CALL_PICKS = 8
const MAX_PAIRING_SOURCES = 50
/** A combo cheaper than this share of its regular price is a pricing mistake. */
const MIN_COMBO_PRICE_RATIO = 0.5
const MAX_REASON_LENGTH = 240
const MAX_SUMMARY_LENGTH = 600

const text = z.string().trim()
const refList = z.array(z.union([z.string(), z.number()]).transform(String)).catch([])

const comboSchema = z.object({
  name: text.catch(''),
  reason: text.catch(''),
  price: z.coerce.number().optional().catch(undefined),
  picks: z.array(z.object({
    label: text.catch(''),
    items: refList,
    count: z.coerce.number().optional().catch(undefined),
  })).catch([]),
})

const upgradeSchema = z.object({
  from: z.union([z.string(), z.number()]).transform(String),
  to: z.union([z.string(), z.number()]).transform(String),
  header: text.catch(''),
  reason: text.catch(''),
})

const pairingSchema = z.object({
  after: refList,
  suggest: refList,
  reason: text.catch(''),
})

const lastCallSchema = z.object({
  title: text.catch(''),
  subtitle: text.catch(''),
  items: refList,
  reason: text.catch(''),
})

const responseSchema = z.object({
  summary: text.catch(''),
  combos: z.array(z.unknown()).catch([]),
  upgrades: z.array(z.unknown()).catch([]),
  pairings: z.array(z.unknown()).catch([]),
  lastCall: z.unknown().optional(),
})

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value
}

function parseEach<T>(schema: z.ZodType<T>, entries: readonly unknown[]): T[] {
  return entries.flatMap((entry) => {
    const parsed = schema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/** Resolve a ref ("i12"), a raw id, or an exact dish name to an available item. */
function makeResolver(ctx: ProposalContext) {
  const byName = new Map<string, string | null>()
  for (const item of ctx.items.values()) {
    const key = item.name.trim().toLowerCase()
    // Two dishes with one name are ambiguous — refuse rather than pick one.
    byName.set(key, byName.has(key) ? null : item.id)
  }
  return (raw: string): ProposalItem | null => {
    const token = raw.trim()
    const fromRef = Object.hasOwn(ctx.refToId, token) ? ctx.refToId[token] : undefined
    const id = fromRef ?? (ctx.items.has(token) ? token : byName.get(token.toLowerCase()) ?? null)
    const item = id ? ctx.items.get(id) : undefined
    return item && item.isAvailable ? item : null
  }
}

type Resolve = ReturnType<typeof makeResolver>

function resolveAll(refs: readonly string[], resolve: Resolve): ProposalItem[] {
  const seen = new Set<string>()
  const out: ProposalItem[] = []
  for (const ref of refs) {
    const item = resolve(ref)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function comboPrice(proposed: number | undefined, regular: number): number {
  const isSane = proposed !== undefined &&
    Number.isFinite(proposed) &&
    proposed < regular &&
    proposed >= regular * MIN_COMBO_PRICE_RATIO
  return isSane ? Math.floor(proposed) : suggestComboPrice(regular)
}

function normalizeCombos(entries: readonly unknown[], ctx: ProposalContext, resolve: Resolve): ComboIdea[] {
  const seen = new Set(ctx.existing.comboKeys)
  const out: ComboIdea[] = []

  for (const combo of parseEach(comboSchema, entries)) {
    if (out.length >= MAX_AI_COMBOS) break
    const picks: (ComboPickIdea & { items: ProposalItem[] })[] = combo.picks
      .slice(0, MAX_COMBO_PICKS)
      .map((pick) => {
        const items = resolveAll(pick.items, resolve).slice(0, MAX_PICK_CHOICES)
        const count = Math.min(MAX_PICK_COUNT, Math.max(1, Math.round(pick.count ?? 1)))
        const label = clip(pick.label || items[0]?.name || 'Choice', 40)
        return { label, itemIds: items.map((i) => i.id), count, items }
      })
      .filter((pick) => pick.items.length > 0)

    const units = picks.reduce((sum, pick) => sum + (pick.count ?? 1), 0)
    if (units < 2) continue
    const key = [...new Set(picks.flatMap((p) => p.itemIds))].sort().join('|')
    if (seen.has(key)) continue

    const regularPrice = comboRegularPrice(picks.map((p) => ({ prices: p.items.map((i) => i.price), count: p.count ?? 1 })))
    if (regularPrice <= 0) continue
    const price = comboPrice(combo.price, regularPrice)
    const name = clip(combo.name || picks.map((p) => p.items[0].name).join(' + '), 60)
    seen.add(key)

    out.push({
      kind: 'combo',
      id: `ai-combo:${key}`,
      title: name,
      reason: clip(combo.reason || 'Suggested from what your customers order together', MAX_REASON_LENGTH),
      itemIds: picks.map((p) => p.itemIds[0]),
      name,
      picks: picks.map(({ label, itemIds, count }) => (count && count > 1 ? { label, itemIds, count } : { label, itemIds })),
      regularPrice,
      price,
      savings: describeSavings(regularPrice, price),
    })
  }
  return out
}

function normalizeUpgrades(entries: readonly unknown[], ctx: ProposalContext, resolve: Resolve): UpgradeIdea[] {
  const takenSources = new Set(ctx.existing.upgradeSourceIds)
  const out: UpgradeIdea[] = []

  for (const upgrade of parseEach(upgradeSchema, entries)) {
    if (out.length >= MAX_AI_UPGRADES) break
    const source = resolve(upgrade.from)
    const target = resolve(upgrade.to)
    if (!source || !target || source.id === target.id) continue
    if (target.price <= source.price || takenSources.has(source.id)) continue
    takenSources.add(source.id)

    const difference = Math.round((target.price - source.price) * 100) / 100
    out.push({
      kind: 'upgrade',
      id: `ai-upgrade:${source.id}:${target.id}`,
      title: `${source.name} → ${target.name}`,
      reason: clip(upgrade.reason || `${target.name} for a little more`, MAX_REASON_LENGTH),
      itemIds: [source.id, target.id],
      sourceId: source.id,
      targetId: target.id,
      header: clip(upgrade.header || 'Upgrade it?', 60),
      priceDifference: difference,
    })
  }
  return out
}

function pairingLabel(sources: readonly ProposalItem[]): string {
  if (sources.length === 1) return sources[0].name
  const categories = new Set(sources.map((s) => s.categoryName))
  const [only] = [...categories]
  return categories.size === 1 && only ? only : 'these dishes'
}

function normalizePairings(entries: readonly unknown[], ctx: ProposalContext, resolve: Resolve): PairingIdea[] {
  // A dish belongs to one pairing: a second would silently merge into the first on save.
  const takenSources = new Set(ctx.existing.pairingSourceIds)
  const out: PairingIdea[] = []

  for (const pairing of parseEach(pairingSchema, entries)) {
    if (out.length >= MAX_AI_PAIRINGS) break
    const sources = resolveAll(pairing.after, resolve)
      .filter((s) => !takenSources.has(s.id))
      .slice(0, MAX_PAIRING_SOURCES)
    const sourceIds = new Set(sources.map((s) => s.id))
    const targets = resolveAll(pairing.suggest, resolve)
      .filter((t) => !sourceIds.has(t.id))
      .slice(0, MAX_PAIRING_TARGETS)
    if (sources.length === 0 || targets.length === 0) continue
    for (const id of sourceIds) takenSources.add(id)

    const label = pairingLabel(sources)
    const targetIds = targets.map((t) => t.id)
    out.push({
      kind: 'pairing',
      id: `ai-pairing:${[...sourceIds].sort().join(',')}:${targetIds.join(',')}`,
      title: `After ${label}, suggest ${targets.map((t) => t.name).join(', ')}`,
      reason: clip(pairing.reason || 'What customers add most often', MAX_REASON_LENGTH),
      itemIds: [sources[0].id, ...targetIds],
      sourceIds: [...sourceIds].sort(),
      targetIds,
      categoryName: label,
    })
  }
  return out
}

function normalizeLastCall(entry: unknown, resolve: Resolve): LastCallIdea[] {
  const parsed = lastCallSchema.safeParse(entry)
  if (!parsed.success) return []
  const picks = resolveAll(parsed.data.items, resolve).slice(0, MAX_LAST_CALL_PICKS)
  if (picks.length === 0) return []
  const title = clip(parsed.data.title || 'Add to your order', 100)
  const pickedItemIds = picks.map((p) => p.id)
  return [{
    kind: 'last_call',
    id: `ai-last-call:${pickedItemIds.join(',')}`,
    title,
    reason: clip(parsed.data.reason || 'Quick add-ons right before checkout', MAX_REASON_LENGTH),
    itemIds: pickedItemIds.slice(0, 4),
    settings: { title, subtitle: clip(parsed.data.subtitle, 200), pickedItemIds },
  }]
}

export function normalizeAiProposals(raw: unknown, ctx: ProposalContext): NormalizedProposals {
  const parsed = responseSchema.safeParse(raw)
  if (!parsed.success) return { summary: '', ideas: [] }
  const resolve = makeResolver(ctx)
  const { summary, combos, upgrades, pairings, lastCall } = parsed.data

  return {
    summary: clip(summary, MAX_SUMMARY_LENGTH),
    ideas: [
      ...normalizeCombos(combos, ctx, resolve),
      ...normalizeUpgrades(upgrades, ctx, resolve),
      ...normalizePairings(pairings, ctx, resolve),
      ...(lastCall ? normalizeLastCall(lastCall, resolve) : []),
    ],
  }
}
